import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayForecast, AnomalyResult, DayClimateContext } from '../types';

const HISTORY_START    = 1979;
const HISTORY_END      = 2024;
const CLIM_WINDOW_DAYS = 15;
const N_DAYS           = 4;   // today + 3

// ── Historical data types ─────────────────────────────────────────────────────

interface HistoricalDay {
  date:   string;
  tmax:   number | null;
  tmin:   number | null;
  precip: number | null;
  wind:   number | null;
}

interface ClimateSample {
  tmax:   number[];
  tmin:   number[];
  precip: number[];
  wind:   number[];
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(lat: number, lon: number): string {
  // Round to 0.5° so nearby GPS fixes reuse the same cache entry
  const latR = Math.round(lat * 2) / 2;
  const lonR = Math.round(lon * 2) / 2;
  return `climCtx_${latR}_${lonR}_${HISTORY_END}`;
}

// ── Fetch from Open-Meteo Historical API (ERA5) ───────────────────────────────

async function fetchHistoricalData(lat: number, lon: number): Promise<HistoricalDay[]> {
  const key    = cacheKey(lat, lon);
  const cached = await AsyncStorage.getItem(key);
  if (cached) return JSON.parse(cached) as HistoricalDay[];

  const params = new URLSearchParams({
    latitude:        lat.toString(),
    longitude:       lon.toString(),
    start_date:      `${HISTORY_START}-01-01`,
    end_date:        `${HISTORY_END}-12-31`,
    daily:           'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    wind_speed_unit: 'ms',
    timezone:        'auto',
  });

  const resp = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!resp.ok) throw new Error(`ERA5 historical fetch failed: ${resp.status}`);

  const data = await resp.json();
  const d    = data.daily;

  const days: HistoricalDay[] = (d.time as string[]).map((date, i) => ({
    date,
    tmax:   d.temperature_2m_max[i]   ?? null,
    tmin:   d.temperature_2m_min[i]   ?? null,
    precip: d.precipitation_sum[i]    ?? null,
    wind:   d.wind_speed_10m_max[i]   ?? null,
  }));

  await AsyncStorage.setItem(key, JSON.stringify(days));
  return days;
}

// ── Day-of-year (1–366) ───────────────────────────────────────────────────────

function dayOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((date.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

// ── Extract ±window day climatological sample ─────────────────────────────────

function getClimateSample(
  historicalDays: HistoricalDay[],
  targetDate: Date,
): ClimateSample {
  const targetDoy = dayOfYear(targetDate);
  const sample: ClimateSample = { tmax: [], tmin: [], precip: [], wind: [] };

  for (const day of historicalDays) {
    const doy  = dayOfYear(new Date(day.date + 'T12:00:00'));
    const diff = Math.abs(doy - targetDoy);
    if (Math.min(diff, 366 - diff) <= CLIM_WINDOW_DAYS) {
      if (day.tmax   !== null) sample.tmax.push(day.tmax);
      if (day.tmin   !== null) sample.tmin.push(day.tmin);
      if (day.precip !== null) sample.precip.push(day.precip);
      if (day.wind   !== null) sample.wind.push(day.wind);
    }
  }
  return sample;
}

// ── Percentile + anomaly computation ─────────────────────────────────────────

function percentileOfScore(value: number, sample: number[]): number {
  if (sample.length === 0) return 50;
  const sorted = [...sample].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) { if (v <= value) count++; }
  return (count / sorted.length) * 100;
}

function computeAnomaly(value: number | null, sample: number[]): AnomalyResult | null {
  if (value === null || sample.length === 0) return null;

  const pct = percentileOfScore(value, sample);
  const p   = pct / 100;

  let tail: AnomalyResult['tail'];
  let returnPeriod: number;

  if (p > 0.5) {
    tail         = 'high';
    returnPeriod = p < 1 ? 1 / (1 - p) : 999;
  } else if (p < 0.5) {
    tail         = 'low';
    returnPeriod = p > 0 ? 1 / p : 999;
  } else {
    tail         = 'median';
    returnPeriod = 1;
  }

  let label: string;
  if      (pct >= 95) label = `Top ${(100 - pct).toFixed(0)}%`;
  else if (pct >= 90) label = 'Very high';
  else if (pct >= 75) label = 'Above avg';
  else if (pct >= 25) label = 'Near normal';
  else if (pct >= 10) label = 'Below avg';
  else if (pct >= 5)  label = 'Very low';
  else                label = `Bottom ${pct.toFixed(0)}%`;

  return { percentile: pct, returnPeriod, tail, label };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getClimateContext(
  lat: number,
  lon: number,
  forecast: DayForecast[],
): Promise<DayClimateContext[]> {
  const historicalDays = await fetchHistoricalData(lat, lon);

  return forecast.slice(0, N_DAYS).map(day => {
    const targetDate = new Date(day.date + 'T12:00:00');
    const sample     = getClimateSample(historicalDays, targetDate);

    return {
      date:     day.date,
      tmax:     computeAnomaly(day.maxTemp,   sample.tmax),
      tmin:     computeAnomaly(day.minTemp,   sample.tmin),
      precip:   computeAnomaly(day.precipMm,  sample.precip),
      wind:     computeAnomaly(day.windSpeed, sample.wind),
      nSamples: sample.tmax.length,
    };
  });
}
