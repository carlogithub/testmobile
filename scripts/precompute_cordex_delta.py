#!/usr/bin/env python3
"""
precompute_cordex_delta.py
==========================
Downloads CORDEX EUR-11 monthly mean 2 m temperature from the Copernicus
Climate Data Store (CDS), computes the warming delta (2045-2055 vs 2010-2024)
for RCP4.5 and RCP8.5, then writes two JSON files at native 0.11° resolution.

Requirements
  cdsapi, xarray, netCDF4, numpy  (all available in the project miniconda env)
  ~/.cdsapirc  must contain valid CDS credentials

Output (copy to / run from  climate-weather-app/assets/data/)
  delta_cordex_ssp245.json   RCP4.5 ≈ SSP2-4.5
  delta_cordex_ssp585.json   RCP8.5 ≈ SSP5-8.5

JSON format
  {
    "source":     "CORDEX EUR-11",
    "resolution": 0.11,
    "ref_period": "2010-2024",
    "fut_period": "2045-2055",
    "lats":  [27.0, 27.11, ..., 71.5],   # north-to-south ordering
    "lons":  [-22.0, -21.89, ..., 44.5],
    "delta": [[...], ...]                  # °C, shape (n_lat, n_lon)
  }

Notes
  - CDS queues requests: expect 1–4 h total runtime depending on server load.
  - Each model pair produces 2 temporary NetCDF files (~150–400 MB each).
  - Failed / unavailable model combinations are skipped with a warning.
  - Run from  assets/data/  so output lands in the right place, or adjust OUT_DIR.
"""

import os, sys, json, tempfile, warnings
import numpy as np
import xarray as xr
import cdsapi

warnings.filterwarnings("ignore")

# ── Output directory ──────────────────────────────────────────────────────────
OUT_DIR = os.getcwd()   # run from assets/data/ for correct placement

# ── Target grid (standard EUR-11 inner domain at 0.11°) ─────────────────────
OUT_LATS = np.round(np.arange(71.5,  26.99, -0.11), 2)   # N → S
OUT_LONS = np.round(np.arange(-22.0, 44.51,  0.11), 2)   # W → E

# ── Time periods ──────────────────────────────────────────────────────────────
# CORDEX historical ends 2005; use scenario runs for 2006 onwards.
REF_START, REF_END   = '2010', '2024'
FUT_START, FUT_END   = '2045', '2055'

# ── Ensemble: diverse GCMs and RCMs for EUR-11 ───────────────────────────────
# Chosen to span different climate sensitivities and circulation responses.
ENSEMBLE = [
    # EC-EARTH driving, different RCMs
    {'gcm': 'ichec_ec_earth',        'rcm': 'knmi_racmo22e',    'member': 'r12i1p1'},
    {'gcm': 'ichec_ec_earth',        'rcm': 'dmi_hirham5',      'member': 'r3i1p1'},
    {'gcm': 'ichec_ec_earth',        'rcm': 'smhi_rca4',        'member': 'r12i1p1'},
    # High-sensitivity GCMs
    {'gcm': 'mohc_hadgem2_es',       'rcm': 'smhi_rca4',        'member': 'r1i1p1'},
    {'gcm': 'ipsl_ipsl_cm5a_mr',     'rcm': 'smhi_rca4',        'member': 'r1i1p1'},
    # Medium-sensitivity GCMs
    {'gcm': 'cnrm_cerfacs_cnrm_cm5', 'rcm': 'smhi_rca4',        'member': 'r1i1p1'},
    {'gcm': 'mpi_m_mpi_esm_lr',      'rcm': 'smhi_rca4',        'member': 'r1i1p1'},
    # Low-sensitivity GCM with different RCM
    {'gcm': 'ncc_noresm1_m',         'rcm': 'smhi_rca4',        'member': 'r1i1p1'},
]

SCENARIOS = {
    'ssp245': 'rcp_4_5',
    'ssp585': 'rcp_8_5',
}

DATASET  = 'projections-cordex-domains-single-levels'
VARIABLE = '2m_air_temperature'
RES      = '0_11_degree_x_0_11_degree'


# ── CDS helpers ──────────────────────────────────────────────────────────────

def _cds_request(client, experiment, gcm, rcm, member, start_year, end_year, outfile):
    """Submit one CDS request and download to outfile. Returns True on success."""
    request = {
        'domain':               'europe',
        'experiment':           experiment,
        'horizontal_resolution': RES,
        'temporal_resolution':  'monthly_mean',
        'variable':             VARIABLE,
        'gcm_model':            gcm,
        'rcm_model':            rcm,
        'ensemble_member':      member,
        'start_year':           start_year,
        'end_year':             end_year,
    }
    try:
        client.retrieve(DATASET, request, outfile)
        return True
    except Exception as e:
        print(f'      CDS error: {e}')
        return False


def _mean_field(nc_path):
    """Open a NetCDF file, return the time-mean 2 m temperature on a lat/lon grid."""
    ds = xr.open_dataset(nc_path, engine='netcdf4')

    # Variable name varies: 'tas' or '2m_air_temperature'
    var = 'tas' if 'tas' in ds else list(ds.data_vars)[0]
    da  = ds[var]

    # Rename spatial dims to lat/lon if needed
    renames = {}
    for old, new in [('latitude', 'lat'), ('longitude', 'lon'),
                     ('rlat', 'lat'), ('rlon', 'lon')]:
        if old in da.dims and new not in da.dims:
            renames[old] = new
    if renames:
        da = da.rename(renames)

    # Drop non-spatial/time dims (e.g. height)
    for dim in list(da.dims):
        if dim not in {'time', 'lat', 'lon'}:
            da = da.isel({dim: 0}, drop=True)

    da = da.mean('time')

    # Convert K → °C if needed (differences are the same, but be explicit)
    if float(da.mean()) > 100:
        da = da - 273.15

    ds.close()
    return da


# ── Core computation ──────────────────────────────────────────────────────────

def compute_cordex_delta(scenario_key):
    """
    For each ensemble member:
      - download reference period (REF_START–REF_END) → reference mean field
      - download future period   (FUT_START–FUT_END)  → future mean field
      - compute delta and regrid to OUT_LATS / OUT_LONS
    Return multimodel mean delta on the standard EUR-11 grid.
    """
    experiment = SCENARIOS[scenario_key]
    client     = cdsapi.Client()
    deltas     = []

    for m in ENSEMBLE:
        gcm, rcm, member = m['gcm'], m['rcm'], m['member']
        tag = f"{gcm}/{rcm}/{member}"
        print(f'\n  [{tag}]')

        with tempfile.TemporaryDirectory() as tmp:
            ref_file = os.path.join(tmp, 'ref.nc')
            fut_file = os.path.join(tmp, 'fut.nc')

            # --- Reference period ---
            print(f'    Downloading reference {REF_START}-{REF_END} …')
            ok = _cds_request(client, experiment, gcm, rcm, member,
                              REF_START, REF_END, ref_file)
            if not ok:
                print(f'    Skipping {tag}: reference download failed')
                continue

            # --- Future period ---
            print(f'    Downloading future {FUT_START}-{FUT_END} …')
            ok = _cds_request(client, experiment, gcm, rcm, member,
                              FUT_START, FUT_END, fut_file)
            if not ok:
                print(f'    Skipping {tag}: future download failed')
                continue

            # --- Compute delta ---
            try:
                ref_da = _mean_field(ref_file)
                fut_da = _mean_field(fut_file)
                delta  = fut_da - ref_da

                # Regrid to standard EUR-11 output grid
                delta_regrid = delta.interp(
                    lat=xr.DataArray(OUT_LATS, dims='lat'),
                    lon=xr.DataArray(OUT_LONS, dims='lon'),
                    method='linear',
                )
                # interp with separate arrays produces (lat, lon) only if we use meshgrid
                # Use scipy-based approach for a proper 2-D grid:
                from scipy.interpolate import RegularGridInterpolator
                src_lats = delta.lat.values
                src_lons = delta.lon.values
                # Ensure ascending order for interpolator
                if src_lats[0] > src_lats[-1]:
                    delta = delta.isel(lat=slice(None, None, -1))
                    src_lats = delta.lat.values
                interp_fn = RegularGridInterpolator(
                    (src_lats, src_lons), delta.values,
                    method='linear', bounds_error=False, fill_value=np.nan
                )
                grid_lons, grid_lats = np.meshgrid(OUT_LONS, OUT_LATS)
                grid_delta = interp_fn(
                    np.column_stack([grid_lats.ravel(), grid_lons.ravel()])
                ).reshape(len(OUT_LATS), len(OUT_LONS))

                mean_val = float(np.nanmean(grid_delta))
                print(f'    Delta EUR mean: {mean_val:+.2f} °C')
                deltas.append(grid_delta)

            except Exception as e:
                print(f'    Skipping {tag}: processing error — {e}')

    if not deltas:
        raise RuntimeError(f'No models succeeded for {scenario_key}.')

    mmm = np.nanmean(np.stack(deltas, axis=0), axis=0)
    print(f'\n  {scenario_key}: multimodel mean = '
          f'{np.nanmean(mmm):+.2f} °C  ({len(deltas)} members)')
    return mmm


# ── Output ────────────────────────────────────────────────────────────────────

def write_json(delta, scenario_key):
    out = {
        'source':     'CORDEX EUR-11',
        'scenario':   scenario_key,
        'resolution': 0.11,
        'ref_period': f'{REF_START}-{REF_END}',
        'fut_period': f'{FUT_START}-{FUT_END}',
        'lats':  OUT_LATS.tolist(),
        'lons':  OUT_LONS.tolist(),
        'delta': [[None if np.isnan(v) else round(float(v), 2) for v in row]
                  for row in delta],
    }
    fname = os.path.join(OUT_DIR, f'delta_cordex_{scenario_key}.json')
    with open(fname, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    size_kb = os.path.getsize(fname) / 1024
    print(f'  Written {fname}  ({size_kb:.0f} KB)')


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('CORDEX EUR-11 delta precomputation')
    print(f'Reference: {REF_START}-{REF_END}   Future: {FUT_START}-{FUT_END}')
    print(f'Ensemble:  {len(ENSEMBLE)} GCM-RCM combinations')
    print(f'Output:    {OUT_DIR}\n')

    for scenario_key in ['ssp245', 'ssp585']:
        print(f'\n{"="*55}\n  {scenario_key}  ({SCENARIOS[scenario_key]})\n{"="*55}')
        delta = compute_cordex_delta(scenario_key)
        write_json(delta, scenario_key)

    print('\nDone.')
