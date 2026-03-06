#!/usr/bin/env python3
"""
precompute_cmip6_delta.py
=========================
Computes the CMIP6 warming delta (2045-2055 minus 2010-2024) for
SSP2-4.5 and SSP5-8.5, then writes two compact JSON files that the
mobile app bundles to apply the climate-change signal to ECMWF forecasts.

Output files (copy to climate-weather-app/assets/data/)
  delta_ssp245.json
  delta_ssp585.json

JSON format
  {
    "resolution": 2.0,          // degrees
    "lats": [90, 88, ..., -90], // north→south
    "lons": [-180, -178, ..., 178],
    "delta": [[...], ...]       // °C, shape (n_lat, n_lon)
  }

Usage
  python precompute_cmip6_delta.py
  # then copy the two JSON files to climate-weather-app/assets/data/
"""

import os
import sys
import json
import warnings
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
warnings.filterwarnings("ignore")

# ── Grid settings ─────────────────────────────────────────────────────────────
OUT_RES   = 2.0                           # degrees — small files, smooth signal
OUT_LATS  = np.arange( 90, -91, -OUT_RES)
OUT_LONS  = np.arange(-180, 180,  OUT_RES)

REF_START, REF_END     = "2010", "2024"   # "present day" baseline
FUTURE_START, FUTURE_END = "2045", "2055" # target future window

MODELS = [
    "CESM2", "GFDL-ESM4", "MPI-ESM1-2-LR", "IPSL-CM6A-LR", "CanESM5",
    "ACCESS-CM2", "BCC-CSM2-MR", "MIROC6", "CNRM-CM6-1", "NorESM2-LM",
]
MEMBER_PRIORITY = ["r1i1p1f1", "r1i1p1f2", "r1i1p1f3"]
PANGEO_CATALOG  = "https://storage.googleapis.com/cmip6/pangeo-cmip6.json"


# ── Pangeo helpers (shared with cmip6_warming_analysis.py) ────────────────────

def _open_catalogue():
    import intake
    print("Opening Pangeo catalogue …")
    return intake.open_esm_datastore(PANGEO_CATALOG)


def _to_dataset(search):
    gcs_opts = {"token": "anon"}
    try:
        return search.to_dataset_dict(
            xarray_open_kwargs={"consolidated": True,
                                "storage_options": gcs_opts})
    except TypeError:
        return search.to_dataset_dict(zarr_kwargs={"consolidated": True},
                                      storage_options=gcs_opts)


def _load_period(col, model, exp_id, start, end):
    """Return DataArray of monthly tas for model/experiment/period, or None."""
    import xarray as xr
    for member in MEMBER_PRIORITY:
        for grid in ["gn", "gr", "gr1"]:
            search = col.search(source_id=model, experiment_id=exp_id,
                                table_id="Amon", variable_id="tas",
                                member_id=member, grid_label=grid)
            if len(search.df) == 0:
                continue
            try:
                dset_dict = _to_dataset(search)
            except Exception:
                continue
            key = list(dset_dict.keys())[0]
            da  = dset_dict[key]["tas"]

            # Normalise dims
            renames = {}
            if "lat" in da.dims: renames["lat"] = "latitude"
            if "lon" in da.dims: renames["lon"] = "longitude"
            if renames: da = da.rename(renames)

            # Drop extra dims
            expected = {"time", "latitude", "longitude"}
            for dim in list(da.dims):
                if dim not in expected:
                    da = da.isel({dim: 0}, drop=True)
            da = da.squeeze(drop=True)

            # Sort / deduplicate time
            da = da.sortby("time")
            _, ui = np.unique(da.time.values, return_index=True)
            da = da.isel(time=ui).sel(time=slice(start, end))

            if len(da.time) == 0:
                continue

            if float(da.isel(time=0).mean()) > 100:
                da = da - 273.15

            # Normalise longitudes
            lons = da.longitude.values
            if lons.max() > 180:
                da = da.assign_coords(
                    longitude=((lons + 180) % 360) - 180
                ).sortby("longitude")

            da = da.sortby("latitude", ascending=False)
            print(f"    {model}/{exp_id}/{member}/{grid}: {len(da.time)} months")
            return da

    print(f"    {model}/{exp_id}: not found — skipping")
    return None


# ── Core computation ──────────────────────────────────────────────────────────

def compute_delta(col, scenario):
    """
    For each model load:
      - historical (up to 2014) + scenario (2015-2024) → reference mean
      - scenario (2045-2055)                            → future mean
    Return multimodel mean delta on the output grid.
    """
    import xarray as xr

    deltas = []
    for model in MODELS:
        print(f"\n  [{model}]")

        # Reference period: historical up to 2014, then scenario from 2015
        ref_segs = []
        for exp_id, t0, t1 in [("historical", REF_START, "2014"),
                                (scenario,     "2015",    REF_END)]:
            da = _load_period(col, model, exp_id, t0, t1)
            if da is not None:
                ref_segs.append(da)

        if not ref_segs:
            print(f"    Skipping {model}: no reference data")
            continue

        ref = xr.concat(ref_segs, dim="time").mean("time")

        # Future period
        fut = _load_period(col, model, scenario, FUTURE_START, FUTURE_END)
        if fut is None:
            print(f"    Skipping {model}: no future data")
            continue

        fut_mean = fut.mean("time")
        delta    = (fut_mean - ref).interp(
            latitude=OUT_LATS, longitude=OUT_LONS, method="linear"
        )
        deltas.append(delta.values)
        print(f"    Delta mean: {float(np.nanmean(delta.values)):+.2f} °C")

    if not deltas:
        raise RuntimeError(f"No models produced a delta for {scenario}.")

    mmm_delta = np.nanmean(np.stack(deltas, axis=0), axis=0)
    print(f"\n  {scenario}: multimodel mean delta = "
          f"{np.nanmean(mmm_delta):+.2f} °C  ({len(deltas)} models)")
    return mmm_delta


def write_json(delta, scenario):
    out = {
        "scenario":   scenario,
        "resolution": OUT_RES,
        "ref_period": f"{REF_START}–{REF_END}",
        "fut_period": f"{FUTURE_START}–{FUTURE_END}",
        "lats":       OUT_LATS.tolist(),
        "lons":       OUT_LONS.tolist(),
        # Round to 2 dp — sufficient for a temperature delta
        # NaN (e.g. polar grid edges) → null so the JSON stays valid
        "delta":      [[None if np.isnan(v) else round(float(v), 2) for v in row]
                       for row in delta],
    }
    fname = f"delta_{scenario}.json"
    with open(fname, "w") as f:
        json.dump(out, f, separators=(",", ":"))   # compact, no spaces
    size_kb = os.path.getsize(fname) / 1024
    print(f"  Written {fname}  ({size_kb:.0f} KB)")
    print(f"  → Copy to climate-weather-app/assets/data/{fname}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    col = _open_catalogue()
    for scenario in ["ssp245", "ssp585"]:
        print(f"\n{'='*55}\n  Computing delta for {scenario}\n{'='*55}")
        delta = compute_delta(col, scenario)
        write_json(delta, scenario)
    print("\nDone.")
