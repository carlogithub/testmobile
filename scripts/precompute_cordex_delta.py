#!/usr/bin/env python3
"""
precompute_cordex_delta.py
==========================
Downloads CORDEX-EUR data from the Copernicus Climate Data Store (CDS)
via the `projections-climate-atlas` dataset, computes monthly warming
deltas (2045-2055 vs 2010-2024) for RCP4.5 and RCP8.5, and writes
JSON files compatible with the ClimateDeltas TypeScript interface.

Data format:
  - One download per variable per scenario (4 total)
  - All 21 ensemble members are delivered in a single file
  - Variable names: 't' (temperature), 'pr' (precipitation)

Output JSON matches the ClimateDeltas interface:
  {
    "scenario", "resolution", "ref_period", "fut_period",
    "agreement_threshold",
    "lats", "lons",
    "tas": { "monthly_delta": [12][nlat][nlon] },   // °C
    "pr":  { "monthly_delta_pct": [12][nlat][nlon],  // %
              "monthly_agreement": [12][nlat][nlon] }  // 0-1
  }

Requirements:
  cdsapi, xarray, netCDF4, numpy, scipy  (all available in miniconda env)
  ~/.cdsapirc  with valid CDS credentials
  CORDEX licence accepted on CDS website

Usage:
  ~/miniconda3/bin/python3 scripts/precompute_cordex_delta.py
  (run from climate-weather-app/ root; outputs go to assets/data/)
"""

import os, sys, json, zipfile, tempfile, warnings
import numpy as np
import xarray as xr
import cdsapi
from scipy.interpolate import RegularGridInterpolator

warnings.filterwarnings("ignore")

# ── Output ────────────────────────────────────────────────────────────────────
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', 'assets', 'data')

# ── Output grid — 0.5° over Europe ───────────────────────────────────────────
OUT_LATS = np.round(np.arange(72.0, 26.5, -0.5), 1)   # 91 values, N→S
OUT_LONS = np.round(np.arange(-22.0, 45.5, 0.5), 1)   # 135 values, W→E

# ── Time periods ──────────────────────────────────────────────────────────────
REF_START, REF_END  = '2010', '2024'
FUT_START, FUT_END  = '2045', '2055'

# ── CDS dataset config ────────────────────────────────────────────────────────
DATASET  = 'projections-climate-atlas'
SCENARIOS = {
    'ssp245': 'rcp_4_5',
    'ssp585': 'rcp_8_5',
}
CDS_VARIABLES = {
    'tas': 'monthly_mean_of_daily_mean_temperature',
    'pr':  'monthly_mean_of_daily_accumulated_precipitation',
}
AGREEMENT_THRESHOLD = 2 / 3

PR_REF_FLOOR = 0.1   # mm/day minimum reference precip to suppress div-by-zero

# ── Helpers ───────────────────────────────────────────────────────────────────

def _download(client, scenario_cds, cds_variable, outfile):
    """Download full 2006-2100 CORDEX-EUR time series to outfile (zip)."""
    request = {
        'origin':     'cordex',
        'domain':     'europe',
        'experiment': scenario_cds,
        'period':     '2006_2100',
        'variable':   cds_variable,
        'format':     'zip',
    }
    print(f'    Requesting CDS: {cds_variable} / {scenario_cds} ...')
    client.retrieve(DATASET, request, outfile)
    print(f'    Download OK — {os.path.getsize(outfile) / 1e6:.1f} MB')


def _extract_nc(zip_path, tmp_dir):
    """Extract the first .nc file from the zip and return its path."""
    with zipfile.ZipFile(zip_path) as z:
        nc_names = [n for n in z.namelist() if n.endswith('.nc')]
        if not nc_names:
            raise RuntimeError(f'No .nc file found in {zip_path}')
        nc_name = nc_names[0]
        z.extract(nc_name, tmp_dir)
        return os.path.join(tmp_dir, nc_name)


def _open_variable(nc_path):
    """Open netCDF and return the primary DataArray (member, time, lat, lon)."""
    ds = xr.open_dataset(nc_path, engine='netcdf4')
    # Pick the first non-bounds data variable
    varname = next(
        v for v in ds.data_vars
        if not any(k in v for k in ('bnds', 'bounds', 'crs'))
    )
    da = ds[varname]
    # Standardise spatial dim names
    renames = {}
    for old, new in [('latitude', 'lat'), ('longitude', 'lon')]:
        if old in da.dims:
            renames[old] = new
    if renames:
        da = da.rename(renames)
    # Drop any unexpected extra dims (e.g. height)
    for dim in list(da.dims):
        if dim not in {'time', 'lat', 'lon', 'member'}:
            da = da.isel({dim: 0}, drop=True)
    return da


def _month_of(time_values):
    """Return integer month array for an array of cftime/datetime objects."""
    try:
        return np.array([t.month for t in time_values])
    except AttributeError:
        import pandas as pd
        return pd.DatetimeIndex(time_values).month.to_numpy()


def _monthly_clim(da, start, end):
    """
    Slice to [start, end] and compute per-member monthly climatology.
    Returns DataArray of shape (12, member, lat, lon) or (12, lat, lon).
    """
    da_sl = da.sel(time=slice(start, end))
    months = _month_of(da_sl.time.values)
    month_da = xr.DataArray(months, coords={'time': da_sl.time}, dims='time')
    return da_sl.groupby(month_da).mean('time')


def _regrid_2d(src_lats, src_lons, src_field, out_lats, out_lons):
    """
    Bilinear regrid of a 2-D array (nlat_src, nlon_src) to (out_lats, out_lons).
    src_lats must be ascending for RegularGridInterpolator.
    """
    if src_lats[0] > src_lats[-1]:
        src_lats = src_lats[::-1]
        src_field = src_field[::-1, :]
    fn = RegularGridInterpolator(
        (src_lats, src_lons), src_field,
        method='linear', bounds_error=False, fill_value=np.nan,
    )
    grid_lons, grid_lats = np.meshgrid(out_lons, out_lats)
    pts = np.column_stack([grid_lats.ravel(), grid_lons.ravel()])
    return fn(pts).reshape(len(out_lats), len(out_lons))


def _serialize(arr3d):
    """Convert (12, nlat, nlon) numpy array to JSON-compatible nested list."""
    result = []
    for month_slice in arr3d:
        row = []
        for lat_row in month_slice:
            row.append([None if np.isnan(v) else round(float(v), 2)
                        for v in lat_row])
        result.append(row)
    return result


# ── Core computation ──────────────────────────────────────────────────────────

def compute_cordex_delta(scenario_key):
    """
    Download tas and pr for one scenario, compute monthly deltas and agreement.
    Returns:
      tas_delta_3d   (12, nlat_out, nlon_out)  °C absolute delta
      pr_delta_pct   (12, nlat_out, nlon_out)  % change
      pr_agreement   (12, nlat_out, nlon_out)  0-1 fraction agreeing on sign
    """
    scenario_cds = SCENARIOS[scenario_key]
    client = cdsapi.Client()

    results = {}

    with tempfile.TemporaryDirectory() as tmp:
        for var_key, cds_var in CDS_VARIABLES.items():
            zip_path = os.path.join(tmp, f'{var_key}.zip')
            _download(client, scenario_cds, cds_var, zip_path)
            nc_path = _extract_nc(zip_path, tmp)

            da = _open_variable(nc_path)
            print(f'    {var_key}: dims={dict(da.sizes)}, '
                  f'time {da.time.values[0]} → {da.time.values[-1]}')

            # Unit conversions
            if var_key == 'tas':
                if float(da.isel(time=0, member=0).mean()) > 100:
                    da = da - 273.15          # K → °C
            elif var_key == 'pr':
                # Convert from kg/m²/s or mm/s → mm/day if needed
                sample = float(da.isel(time=0, member=0).mean())
                if sample < 0.01:            # probably kg/m²/s
                    da = da * 86400

            ref_clim = _monthly_clim(da, REF_START, REF_END)  # (12, member, lat, lon)
            fut_clim = _monthly_clim(da, FUT_START, FUT_END)

            src_lats = da.lat.values
            src_lons = da.lon.values
            n_members = da.sizes.get('member', 1)

            # Per-member delta, then regrid to output grid
            member_deltas = []  # list of (12, nlat_out, nlon_out)
            for m in range(n_members):
                if 'member' in ref_clim.dims:
                    ref_m = ref_clim.isel(member=m).values   # (12, lat, lon)
                    fut_m = fut_clim.isel(member=m).values
                else:
                    ref_m = ref_clim.values
                    fut_m = fut_clim.values

                if var_key == 'tas':
                    delta_m = fut_m - ref_m                   # °C absolute
                else:
                    # % change, guard against near-zero reference
                    ref_safe = np.where(ref_m < PR_REF_FLOOR, PR_REF_FLOOR, ref_m)
                    delta_m = (fut_m - ref_m) / ref_safe * 100.0

                # Regrid each month layer
                delta_regrid = np.stack([
                    _regrid_2d(src_lats, src_lons, delta_m[mo],
                               OUT_LATS, OUT_LONS)
                    for mo in range(12)
                ], axis=0)
                member_deltas.append(delta_regrid)

            stack = np.stack(member_deltas, axis=0)  # (n_members, 12, nlat, nlon)
            results[var_key] = stack

            mean_val = float(np.nanmean(stack))
            print(f'    {var_key}: {n_members} members, mean delta = {mean_val:+.2f}')

    # Multimodel mean
    tas_stack = results['tas']   # (n_members, 12, nlat, nlon)
    pr_stack  = results['pr']

    tas_delta = np.nanmean(tas_stack, axis=0)   # (12, nlat, nlon)
    pr_delta  = np.nanmean(pr_stack,  axis=0)

    # Precipitation: % change of multimodel mean
    pr_delta_pct = pr_delta   # already in % per member, take mean of %

    # Agreement: fraction of members whose sign matches the multimodel mean sign
    pr_sign = np.sign(pr_delta)   # (12, nlat, nlon)
    member_signs = np.sign(pr_stack)   # (n_members, 12, nlat, nlon)
    pr_agreement = np.mean(member_signs == pr_sign[np.newaxis], axis=0)

    print(f'\n  {scenario_key}: tas mean = {np.nanmean(tas_delta):+.2f}°C, '
          f'pr mean = {np.nanmean(pr_delta_pct):+.1f}%, '
          f'agreement = {np.nanmean(pr_agreement):.0%}')

    return tas_delta, pr_delta_pct, pr_agreement


# ── Output ────────────────────────────────────────────────────────────────────

def write_json(tas_delta, pr_delta_pct, pr_agreement, scenario_key):
    out = {
        'scenario':           scenario_key,
        'source':             'CORDEX-EUR via CDS projections-climate-atlas',
        'resolution':         0.5,
        'ref_period':         f'{REF_START}-{REF_END}',
        'fut_period':         f'{FUT_START}-{FUT_END}',
        'agreement_threshold': AGREEMENT_THRESHOLD,
        'lats':               OUT_LATS.tolist(),
        'lons':               OUT_LONS.tolist(),
        'tas': {
            'monthly_delta':     _serialize(tas_delta),
        },
        'pr': {
            'monthly_delta_pct': _serialize(pr_delta_pct),
            'monthly_agreement': _serialize(pr_agreement),
        },
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    fname = os.path.join(OUT_DIR, f'delta_cordex_{scenario_key}.json')
    content = json.dumps(out, separators=(',', ':'))
    with open(fname, 'w') as f:
        f.write(content)
    size_kb = os.path.getsize(fname) / 1024
    print(f'  Written {fname}  ({size_kb:.0f} KB)')


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import sys
    scenarios = sys.argv[1:] if len(sys.argv) > 1 else ['ssp245', 'ssp585']
    print('CORDEX-EUR delta precomputation (projections-climate-atlas)')
    print(f'Reference: {REF_START}-{REF_END}   Future: {FUT_START}-{FUT_END}')
    print(f'Output grid: {len(OUT_LATS)} lats × {len(OUT_LONS)} lons @ 0.5°')
    print(f'Output dir: {OUT_DIR}\n')

    for scenario_key in scenarios:
        print(f'\n{"="*55}\n  {scenario_key}  ({SCENARIOS[scenario_key]})\n{"="*55}')
        tas_delta, pr_delta_pct, pr_agreement = compute_cordex_delta(scenario_key)
        write_json(tas_delta, pr_delta_pct, pr_agreement, scenario_key)

    print('\nDone.')
