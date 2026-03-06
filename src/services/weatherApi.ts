import { DayForecast } from '../types';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const MODEL    = 'ecmwf_ifs025';

interface OpenMeteoResponse {
  daily: {
    time:                  string[];
    temperature_2m_max:    number[];
    temperature_2m_min:    number[];
    weathercode:           number[];
    precipitation_sum:     number[];
  };
}

/**
 * Fetch a 7-day daily forecast from Open-Meteo (ECMWF IFS model).
 */
export async function fetchForecast(
  latitude: number,
  longitude: number
): Promise<DayForecast[]> {
  const params = new URLSearchParams({
    latitude:      latitude.toString(),
    longitude:     longitude.toString(),
    daily:         'temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum',
    timezone:      'auto',
    models:        MODEL,
    forecast_days: '7',
  });

  const response = await fetch(`${BASE_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data: OpenMeteoResponse = await response.json();
  const { time, temperature_2m_max, temperature_2m_min, weathercode, precipitation_sum } = data.daily;

  return time.map((dateStr, i) => ({
    date:        dateStr,
    dayLabel:    i === 0 ? 'Today' : formatDayLabel(dateStr),
    maxTemp:     Math.round(temperature_2m_max[i]),
    minTemp:     Math.round(temperature_2m_min[i]),
    weatherCode: weathercode[i],
    precipMm:    Math.round((precipitation_sum[i] ?? 0) * 10) / 10,
  }));
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * WMO weather code → { emoji, description }
 * https://open-meteo.com/en/docs#weathervariables
 */
export function weatherCodeToDisplay(code: number): {
  emoji: string;
  description: string;
} {
  if (code === 0)                  return { emoji: '☀️',  description: 'Clear sky' };
  if (code === 1)                  return { emoji: '🌤️', description: 'Mainly clear' };
  if (code === 2)                  return { emoji: '⛅',  description: 'Partly cloudy' };
  if (code === 3)                  return { emoji: '☁️',  description: 'Overcast' };
  if ([45, 48].includes(code))     return { emoji: '🌫️', description: 'Fog' };
  if ([51, 53].includes(code))     return { emoji: '🌦️', description: 'Light drizzle' };
  if (code === 55)                 return { emoji: '🌧️', description: 'Drizzle' };
  if ([61, 63].includes(code))     return { emoji: '🌧️', description: 'Rain' };
  if (code === 65)                 return { emoji: '🌧️', description: 'Heavy rain' };
  if ([71, 73, 75].includes(code)) return { emoji: '🌨️', description: 'Snow' };
  if ([77].includes(code))         return { emoji: '🌨️', description: 'Snow grains' };
  if ([80, 81].includes(code))     return { emoji: '🌦️', description: 'Rain showers' };
  if (code === 82)                 return { emoji: '⛈️',  description: 'Heavy showers' };
  if ([85, 86].includes(code))     return { emoji: '🌨️', description: 'Snow showers' };
  if (code === 95)                 return { emoji: '⛈️',  description: 'Thunderstorm' };
  if ([96, 99].includes(code))     return { emoji: '⛈️',  description: 'Thunderstorm + hail' };
  return { emoji: '🌡️', description: 'Unknown' };
}
