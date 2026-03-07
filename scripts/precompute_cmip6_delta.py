#!/usr/bin/env python3
"""
precompute_cmip6_delta.py
=========================
Computes monthly CMIP6 warming deltas (2045-2055 minus 2010-2024) for
SSP2-4.5 and SSP5-8.5, for both temperature (tas) and precipitation (pr).

Output files (copy to climate-weather-app/assets/data/)
  delta_ssp245.json
  delta_ssp585.json

JSON format
  {
    "scenario": "ssp245",
    "resolution": 2.0,
    "ref_period": "2010-2024",
    "fut_period": "2045-2055",
    "lats": [90, 88, ..., -90],
    "lons": [-180, -178, ..., 178],
    "tas": {
      "monthly_delta": [12 x [nlat x nlon]]   // °C absolute, index 0=Jan
    },
    "pr": {
      "monthly_delta_pct": [12 x [nlat x nlon]],  // % change, null where uncertain
      "monthly_agreement": [12 x [nlat x nlon]]   // 0-1 fraction of models agreeing on sign
    }
  }

Usage
  cd climate-weather-app/assets/data
  ~/miniconda3/bin/python3 ../../scripts/precompute_cmip6_delta.py
"""

import os, sys, json, warnings
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
warnings.filterwarnings("ignore")

# ── Grid settings ──────────────────────────────────────────────────────────────
OUT_RES  = 2.0
OUT_LATS = np.arange( 90, -91, -OUT_RES)
OUT_LONS = np.arange(-180, 180,  OUT_RES)

REF_START, REF_END     = "2010", "2024"
FUTURE_START, FUTURE_END = "2045", "2055"

# Agreement threshold stored in output; app uses this to decide whether to show signal
AGREEMENT_THRESHOLD = 2/3

MODELS = [
    "CESM2", "GFDL-ESM4", "MPI-ESM1-2-LR", "IPSL-CM6A-LR", "CanESM5",
    "ACCESS-CM2", "BCC-CSM2-MR", "MIROC6", "CNRM-CM6-1", "NorESM2-LM",
]
MEMBER_PRIORITY = ["r1i1p1f1", "r1i1p1f2", "r1i1p1f3"]
PANGEO_CATALOG  = "https://storage.googleapis.com/cmip6/pangeo-cmip6.json"


# ── Pangeo helpers ─────────────────────────────────────────────────────────────

def _open_catalogue():
    import intake
    print("Opening Pangeo catalogue …")
    return intake.open_esm_datastore(PANGEO_CATALOG)


def _to_dataset(search):
    gcs_opts = {"token": "anon"}
    try:
        return search.to_dataset_dict(
            xarray_open_kwargs={"consolidated": True, "storage_options": gcs_opts})
    except TypeError:
        return search.to_dataset_dict(zarr_kwargs={"consolidated": True},
                                      storage_options=gcs_opts)


def _load_period(col, model, exp_id, variable, start, end):
    """Return DataArray of monthly variable for model/experiment/period, or None."""
    import xarray as xr
    for member in MEMBER_PRIORITY:
        for grid in ["gn", "gr", "gr1"]:
            search = col.search(source_id=model, experiment_id=exp_id,
                                table_id="Amon", variable_id=variable,
                                member_id=member, grid_label=grid)
            if len(search.df) == 0:
                continue
            try:
                dset_dict = _to_dataset(search)
            except Exception:
                continue
            key  = list(dset_dict.keys())[0]
            da   = dset_dict[key][variable]

            renames = {}
            if "lat" in da.dims: renames["lat"] = "latitude"
            if "lon" in da.dims: renames["lon"] = "longitude"
            if renames: da = da.rename(renames)

            expected = {"time", "latitude", "longitude"}
            for dim in list(da.dims):
                if dim not in expected:
                    da = da.isel({dim: 0}, drop=True)
            da = da.squeeze(drop=True)

            da = da.sortby("time")
            _, ui = np.unique(da.time.values, return_index=True)
            da = da.isel(time=ui).sel(time=slice(start, end))

            if len(da.time) == 0:
                continue

            # Unit conversions
            if variable == "tas" and float(da.isel(time=0).mean()) > 100:
                da = da - 273.15          # K → °C
            if variable == "pr":
                da = da * 86400           # kg/m²/s → mm/day

            lons = da.longitude.values
            if lons.max() > 180:
                da = da.assign_coords(
                    longitude=((lons + 180) % 360) - 180
                ).sortby("longitude")

            da = da.sortby("latitude", ascending=False)
            print(f"    {model}/{exp_id}/{member}/{grid}/{variable}: {len(da.time)} months")
            return da

    print(f"    {model}/{exp_id}/{variable}: not found — skipping")
    return None


# ── Core computation ───────────────────────────────────────────────────────────

def _monthly_means(da):
    """Return DataArray of shape (12, nlat, nlon): climatological monthly means."""
    import xarray as xr
    # Manually extract month values — handles cftime heterogeneous calendars
    # (da.time.dt.month / groupby("time.month") fail after xr.concat across zarr stores)
    try:
        month_arr = np.array([t.month for t in da.time.values])
    except AttributeError:
        import pandas as pd
        month_arr = pd.DatetimeIndex(da.time.values).month.to_numpy()
    months = xr.DataArray(month_arr, coords={"time": da.time}, dims="time")
    return da.groupby(months).mean("time")


def _regrid(da_monthly, out_lats, out_lons):
    """Regrid a (12, lat, lon) DataArray to out_lats/out_lons via linear interp."""
    import xarray as xr
    return da_monthly.interp(
        latitude=xr.DataArray(out_lats,  dims="latitude"),
        longitude=xr.DataArray(out_lons, dims="longitude"),
        method="linear",
    )


def compute_deltas(col, scenario):
    """
    For each model compute monthly deltas for tas and pr.
    Returns:
      tas_deltas  : list of (12, nlat, nlon) arrays  [°C]
      pr_deltas   : list of (12, nlat, nlon) arrays  [%]
    """
    import xarray as xr
    tas_deltas, pr_deltas = [], []

    for model in MODELS:
        print(f"\n  [{model}]")
        model_tas, model_pr = {}, {}

        for variable in ["tas", "pr"]:
            ref_segs = []
            for exp_id, t0, t1 in [("historical", REF_START, "2014"),
                                    (scenario,     "2015",    REF_END)]:
                da = _load_period(col, model, exp_id, variable, t0, t1)
                if da is not None:
                    ref_segs.append(da)

            if not ref_segs:
                print(f"    Skipping {model}/{variable}: no reference data")
                break

            ref_clim = _monthly_means(xr.concat(ref_segs, dim="time"))

            fut = _load_period(col, model, scenario, variable, FUTURE_START, FUTURE_END)
            if fut is None:
                print(f"    Skipping {model}/{variable}: no future data")
                break

            fut_clim = _monthly_means(fut)

            if variable == "tas":
                delta = (fut_clim - ref_clim).interp(
                    latitude=xr.DataArray(OUT_LATS, dims="latitude"),
                    longitude=xr.DataArray(OUT_LONS, dims="longitude"),
                    method="linear",
                )
                model_tas = delta.values   # (12, nlat, nlon)

            elif variable == "pr":
                # Percentage change; guard against near-zero reference (< 0.1 mm/day)
                ref_safe = ref_clim.where(ref_clim > 0.1, other=np.nan)
                pct = ((fut_clim - ref_clim) / ref_safe * 100).interp(
                    latitude=xr.DataArray(OUT_LATS, dims="latitude"),
                    longitude=xr.DataArray(OUT_LONS, dims="longitude"),
                    method="linear",
                )
                model_pr = pct.values   # (12, nlat, nlon)

        if isinstance(model_tas, np.ndarray) and isinstance(model_pr, np.ndarray):
            tas_mean = float(np.nanmean(model_tas))
            pr_mean  = float(np.nanmean(model_pr))
            print(f"    tas delta mean: {tas_mean:+.2f} °C   pr delta mean: {pr_mean:+.1f}%")
            tas_deltas.append(model_tas)
            pr_deltas.append(model_pr)

    n = len(tas_deltas)
    if n == 0:
        raise RuntimeError(f"No models produced deltas for {scenario}.")

    print(f"\n  {scenario}: {n} models succeeded")

    tas_stack = np.stack(tas_deltas, axis=0)   # (n_models, 12, nlat, nlon)
    pr_stack  = np.stack(pr_deltas,  axis=0)

    mmm_tas = np.nanmean(tas_stack, axis=0)    # (12, nlat, nlon)
    mmm_pr  = np.nanmean(pr_stack,  axis=0)

    # Model agreement: fraction of models whose sign matches the multimodel mean sign
    pr_sign        = np.sign(mmm_pr)
    model_signs    = np.sign(pr_stack)
    agreement      = np.nanmean(model_signs == pr_sign, axis=0)  # (12, nlat, nlon)

    print(f"  tas annual mean: {np.nanmean(mmm_tas):+.2f} °C")
    print(f"  pr  annual mean: {np.nanmean(mmm_pr):+.1f}%")
    print(f"  pr  agreement  : {np.nanmean(agreement):.0%} of cells have >{AGREEMENT_THRESHOLD:.0%} agreement")

    return mmm_tas, mmm_pr, agreement


# ── Output ─────────────────────────────────────────────────────────────────────

def _serialize(arr):
    """Flatten 3D (12, nlat, nlon) numpy array to nested lists, NaN → null."""
    result = []
    for month_slice in arr:
        row = []
        for lat_row in month_slice:
            row.append([None if np.isnan(v) else round(float(v), 2) for v in lat_row])
        result.append(row)
    return result


def write_json(tas_delta, pr_delta_pct, pr_agreement, scenario):
    out = {
        "scenario":   scenario,
        "resolution": OUT_RES,
        "ref_period": f"{REF_START}-{REF_END}",
        "fut_period": f"{FUTURE_START}-{FUTURE_END}",
        "agreement_threshold": AGREEMENT_THRESHOLD,
        "lats":  OUT_LATS.tolist(),
        "lons":  OUT_LONS.tolist(),
        "tas": {
            "monthly_delta": _serialize(tas_delta),
        },
        "pr": {
            "monthly_delta_pct": _serialize(pr_delta_pct),
            "monthly_agreement": _serialize(pr_agreement),
        },
    }
    fname = f"delta_{scenario}.json"
    with open(fname, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size_kb = os.path.getsize(fname) / 1024
    print(f"  Written {fname}  ({size_kb:.0f} KB)")
    print(f"  → Copy to climate-weather-app/assets/data/{fname}")


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    scenarios = sys.argv[1:] if len(sys.argv) > 1 else ["ssp245", "ssp585"]
    col = _open_catalogue()
    for scenario in scenarios:
        print(f"\n{'='*55}\n  Computing deltas for {scenario}\n{'='*55}")
        tas_delta, pr_delta_pct, pr_agreement = compute_deltas(col, scenario)
        write_json(tas_delta, pr_delta_pct, pr_agreement, scenario)
    print("\nDone.")
