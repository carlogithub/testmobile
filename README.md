# Weather 2050

A React Native app that shows today's weather alongside a **2050 climate projection**, letting you see how your local climate may change by mid-century — and how unusual today's conditions already are compared to the historical record.

## What it does

- Fetches your current 7-day weather forecast from the **Open-Meteo API** (ECMWF IFS model) using your device's GPS location
- Adds **CMIP6 multimodel mean warming deltas** to each forecast day to produce a "2050 equivalent" temperature and precipitation
- Supports two emissions scenarios: **SSP2-4.5** (middle road) and **SSP5-8.5** (high emissions)
- For users in **Europe**, automatically uses higher-resolution **CORDEX-EUR** regional climate projections instead of global CMIP6 data
- Displays results as a 7-day forecast list and an interactive SVG chart
- Works fully offline for the climate signal (delta data is bundled in the app)
- Opens a **Climate Context screen** that tells you how unusual today's and the next few days' weather is compared to the ERA5 historical record at your location (1979–2024)
- Shows whether unusual conditions are **consistent with, or counter to, what CMIP6 models project** for your location by ~2050

## Screens

### Home screen
The main view shows today's weather and a side-by-side "2050 equivalent" for temperature and precipitation. A 7-day forecast list lets you toggle between the two emissions scenarios. A chart view plots all three lines (today / SSP2-4.5 / SSP5-8.5) together.

### Climate Context screen
Tap the **"🌡 Context"** button in the header to open this screen. For today and the next three forecast days it shows:

- **Observed value** for max temperature, min temperature, precipitation, and wind speed
- **Anomaly badge** — how unusual each value is relative to the ERA5 historical climatology for the same time of year (±15-day window, 1979–2024). Colour-coded from dark blue (exceptionally cold/dry) through green (near normal) to red (exceptionally warm/wet)
- **Trend consistency chip** — for temperature and precipitation only, a coloured pill stating whether today's anomaly is consistent with what CMIP6 models project for this location by ~2050:
  - **Green** — "Aligns with CMIP6 projected +X.X°C warming by ~2050"
  - **Amber** — "Counter to CMIP6 projected trend"
  - **Grey** — "CMIP6 models disagree on precipitation trend here" (shown when fewer than 66% of models agree on the direction of change)
  - No chip — conditions are within the normal 25–75th percentile range; nothing to flag

> The chip describes direction only. A single warm day is not proof of climate change — but a persistent pattern of warm anomalies aligning with model projections is a meaningful signal.

## Climate data sources

| Dataset | Coverage | Models / members | Resolution |
|---|---|---|---|
| CMIP6 | Global | 9 models | 2.0° |
| CORDEX-EUR | Europe | 21–50 members | 0.5° |
| ERA5 (via Open-Meteo) | Global | Reanalysis | ~0.25° |

- **Baseline period**: 2010–2024
- **Future period**: 2045–2055
- **Temperature delta**: absolute °C change per calendar month
- **Precipitation delta**: % change per month; uncertainty shown when model agreement < 66%
- **Historical anomaly**: percentile rank over ±15-day calendar window, 1979–2024
- **Trend consistency**: uses SSP5-8.5 projected direction as reference

## Stack

- [Expo](https://expo.dev/) ~54 / React Native 0.81.5 / React 19 / TypeScript
- `expo-location` — GPS + reverse geocoding
- `react-native-svg` — temperature and precipitation charts
- `@react-navigation/native-stack` — screen navigation
- `@react-native-async-storage/async-storage` — caching ERA5 history on device
- Open-Meteo API — weather forecast and ERA5 historical data (free, no API key required)

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

> **Note on tunnel mode:** if you see `Cannot read properties of undefined (reading 'body')`, the ngrok binary or auth token is missing. Fix:
> ```bash
> npm install @expo/ngrok-bin-darwin-arm64          # macOS Apple Silicon
> node_modules/@expo/ngrok-bin-darwin-arm64/ngrok authtoken YOUR_TOKEN
> ```
> Get a free token at [ngrok.com](https://ngrok.com).

## Project structure

```
App.tsx                           # Entry point, navigation container
src/
  screens/
    HomeScreen.tsx                # Main UI — forecast, delta, chart/list toggle
    ClimateContextScreen.tsx      # ERA5 anomaly + CMIP6 trend consistency
  components/
    DayForecastRow.tsx            # Today vs 2050 row in the forecast list
    TempChart.tsx                 # SVG line chart (today / SSP2-4.5 / SSP5-8.5)
    PrecipChart.tsx               # SVG grouped bar chart for precipitation
    ScenarioToggle.tsx            # SSP2-4.5 / SSP5-8.5 pill toggle
    AnomalyBadge.tsx              # Colour-coded percentile badge
    ConsistencyChip.tsx           # CMIP6 trend consistency pill
  services/
    weatherApi.ts                 # Open-Meteo forecast fetch + WMO code mapping
    climateDelta.ts               # Bilinear interpolation; CORDEX/CMIP6 routing
    climateContext.ts             # ERA5 history fetch, AsyncStorage cache, percentiles
    consistencyCheck.ts           # Compares anomaly direction vs CMIP6 projected trend
    locationService.ts            # GPS permission + reverse geocode
  types/index.ts                  # Shared TypeScript types
assets/data/
  delta_ssp245.json               # CMIP6 SSP2-4.5 monthly delta grid
  delta_ssp585.json               # CMIP6 SSP5-8.5 monthly delta grid
  delta_cordex_ssp245.json        # CORDEX-EUR RCP4.5 monthly delta grid
  delta_cordex_ssp585.json        # CORDEX-EUR RCP8.5 monthly delta grid
scripts/
  precompute_cmip6_delta.py       # Regenerate CMIP6 delta JSONs (Pangeo/xarray)
  precompute_cordex_delta.py      # Regenerate CORDEX delta JSONs (CDS API)
```

## Regenerating the climate delta files

The bundled JSON files are pre-computed. To regenerate them from source data:

**CMIP6 (global):**
```bash
cd assets/data
~/miniconda3/bin/python3 scripts/precompute_cmip6_delta.py
```
Requires: `numpy`, `xarray`, `intake`, `intake_esm`, `gcsfs`, `zarr` (Pangeo cloud data). Takes ~20 minutes.

**CORDEX-EUR (Europe):**
```bash
~/miniconda3/bin/python3 scripts/precompute_cordex_delta.py
```
Requires a [Copernicus CDS](https://cds.climate.copernicus.eu/) account with credentials in `~/.cdsapirc` and the CORDEX licence accepted. Takes ~20 minutes.

Both scripts output directly to `assets/data/`.
