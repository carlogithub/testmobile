# Weather 2050

A React Native app that shows today's weather alongside a **2050 climate projection**, letting you see how your local climate may change by mid-century.

## What it does

- Fetches your current 7-day weather forecast from the **Open-Meteo API** (ECMWF IFS model) using your device's GPS location
- Adds **CMIP6 multimodel mean warming deltas** to each forecast day to produce a "2050 equivalent" temperature and precipitation
- Supports two emissions scenarios: **SSP2-4.5** (middle road) and **SSP5-8.5** (high emissions)
- For users in **Europe**, automatically uses higher-resolution **CORDEX-EUR** regional climate projections instead of global CMIP6 data
- Displays results as a 7-day forecast list and an interactive SVG chart
- Works fully offline for the climate signal (delta data is bundled in the app)

## Climate data sources

| Dataset | Coverage | Models | Resolution |
|---|---|---|---|
| CMIP6 | Global | 9 models | 2.0° |
| CORDEX-EUR | Europe | 21–50 members | 0.5° |

- **Baseline period**: 2010–2024
- **Future period**: 2045–2055
- **Temperature**: absolute °C delta per calendar month
- **Precipitation**: % change per month; shown with uncertainty indicator when model agreement < 66%

## Stack

- [Expo](https://expo.dev/) ~54 / React Native 0.81.5 / React 19 / TypeScript
- `expo-location` — GPS + reverse geocoding
- `react-native-svg` — temperature and precipitation charts
- Open-Meteo API — free, no API key required

## Getting started

### Prerequisites

- Node.js ≥ 18
- [Expo Go](https://expo.dev/go) installed on your phone (iOS or Android)

### Install

```bash
git clone https://github.com/carlogithub/testmobile.git
cd testmobile
npm install
```

### Run

```bash
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

If you are on a restricted network (corporate WiFi, etc.) use tunnel mode:

```bash
npx expo start --tunnel
```

## Project structure

```
App.tsx                        # Entry point
src/
  screens/HomeScreen.tsx        # Main UI — loads location, forecast, applies delta
  components/
    DayForecastRow.tsx          # Today vs 2050 row in the forecast list
    TempChart.tsx               # SVG line chart (today / SSP2-4.5 / SSP5-8.5)
    PrecipChart.tsx             # SVG grouped bar chart for precipitation
    ScenarioToggle.tsx          # SSP2-4.5 / SSP5-8.5 pill toggle
  services/
    weatherApi.ts               # Open-Meteo fetch + WMO weather code mapping
    climateDelta.ts             # Bilinear interpolation of delta grids; CORDEX/CMIP6 routing
    locationService.ts          # GPS permission + reverse geocode
  types/index.ts                # Shared TypeScript types
assets/data/
  delta_ssp245.json             # CMIP6 SSP2-4.5 monthly delta grid
  delta_ssp585.json             # CMIP6 SSP5-8.5 monthly delta grid
  delta_cordex_ssp245.json      # CORDEX-EUR RCP4.5 monthly delta grid
  delta_cordex_ssp585.json      # CORDEX-EUR RCP8.5 monthly delta grid
scripts/
  precompute_cmip6_delta.py     # Regenerate CMIP6 delta JSONs (requires Pangeo/xarray)
  precompute_cordex_delta.py    # Regenerate CORDEX delta JSONs (requires CDS API key)
```

## Regenerating the climate delta files

The bundled JSON files are pre-computed. To regenerate them from source data:

**CMIP6 (global):**
```bash
cd assets/data
~/miniconda3/bin/python3 scripts/precompute_cmip6_delta.py
```
Requires: `numpy`, `xarray`, `intake`, `intake_esm`, `gcsfs`, `zarr` (Pangeo cloud data).

**CORDEX-EUR (Europe):**
```bash
~/miniconda3/bin/python3 scripts/precompute_cordex_delta.py
```
Requires a [Copernicus CDS](https://cds.climate.copernicus.eu/) account with credentials in `~/.cdsapirc` and the CORDEX licence accepted.

Both scripts take ~20 minutes and output directly to `assets/data/`.
