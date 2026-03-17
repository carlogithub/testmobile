export type Scenario = 'ssp245' | 'ssp585';

export interface DayForecast {
  date: string;         // ISO date string e.g. "2024-03-15"
  dayLabel: string;     // e.g. "Mon", "Today"
  maxTemp: number;      // °C
  minTemp: number;      // °C
  weatherCode: number;  // WMO weather interpretation code
  precipMm: number;     // mm/day
  windSpeed: number;    // m/s daily max
}

// ── Climate context (anomaly vs ERA5 climatology) ─────────────────────────────

export interface AnomalyResult {
  percentile: number;          // 0–100
  returnPeriod: number;        // years
  tail: 'high' | 'low' | 'median';
  label: string;               // e.g. "Top 5%", "Near normal"
}

export interface DayClimateContext {
  date: string;
  tmax:   AnomalyResult | null;
  tmin:   AnomalyResult | null;
  precip: AnomalyResult | null;
  wind:   AnomalyResult | null;
  nSamples: number;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  cityName: string;
  countryName: string;
}

/** Monthly climate delta data bundled as a JSON asset. */
export interface ClimateDeltas {
  scenario: string;
  resolution: number;
  ref_period: string;
  fut_period: string;
  agreement_threshold: number;
  lats: number[];
  lons: number[];
  tas: {
    /** Shape: [12 months][nlat][nlon], °C absolute delta, index 0 = January */
    monthly_delta: (number | null)[][][];
  };
  pr: {
    /** Shape: [12 months][nlat][nlon], % change */
    monthly_delta_pct: (number | null)[][][];
    /** Shape: [12 months][nlat][nlon], 0–1 fraction of models agreeing on sign */
    monthly_agreement: (number | null)[][][];
  };
}

/** Result of a delta lookup for one location + month. */
export interface DeltaResult {
  tasDelta: number;
  /** null when model agreement is below threshold — suppress precip signal */
  prDeltaPct: number | null;
}
