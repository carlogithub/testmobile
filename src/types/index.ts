export type Scenario = 'ssp245' | 'ssp585';

export interface DayForecast {
  date: string;        // ISO date string e.g. "2024-03-15"
  dayLabel: string;    // e.g. "Mon", "Today"
  maxTemp: number;     // °C
  minTemp: number;     // °C
  weatherCode: number; // WMO weather interpretation code
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  cityName: string;
  countryName: string;
}

export interface DeltaData {
  scenario: string;
  resolution: number;
  lats: number[];
  lons: number[];
  delta: (number | null)[][];
}
