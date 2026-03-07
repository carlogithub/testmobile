import { ClimateDeltas, DeltaResult, Scenario } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CMIP6_SSP245: ClimateDeltas = require('../../assets/data/delta_ssp245.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CMIP6_SSP585: ClimateDeltas = require('../../assets/data/delta_ssp585.json');

// CORDEX-EUR files — bundled once generated; null-guarded below until available
let CORDEX_SSP245: ClimateDeltas | null = null;
let CORDEX_SSP585: ClimateDeltas | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CORDEX_SSP245 = require('../../assets/data/delta_cordex_ssp245.json');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CORDEX_SSP585 = require('../../assets/data/delta_cordex_ssp585.json');
} catch {
  // CORDEX JSONs not yet generated — fall back to CMIP6 globally
}

/**
 * European domain for CORDEX routing.
 * Within this box, CORDEX-EUR data is preferred (higher resolution, RCM physics).
 */
const CORDEX_DOMAIN = { latMin: 27, latMax: 72, lonMin: -22, lonMax: 45 };

export function isInEuropeanDomain(latitude: number, longitude: number): boolean {
  return (
    latitude  >= CORDEX_DOMAIN.latMin && latitude  <= CORDEX_DOMAIN.latMax &&
    longitude >= CORDEX_DOMAIN.lonMin && longitude <= CORDEX_DOMAIN.lonMax
  );
}

function getDeltas(scenario: Scenario, latitude: number, longitude: number): ClimateDeltas {
  if (isInEuropeanDomain(latitude, longitude)) {
    const cordex = scenario === 'ssp245' ? CORDEX_SSP245 : CORDEX_SSP585;
    if (cordex?.tas?.monthly_delta) return cordex;
  }
  return scenario === 'ssp245' ? CMIP6_SSP245 : CMIP6_SSP585;
}

/**
 * Bilinear interpolation of a single monthly layer (lats × lons) to a lat/lon point.
 * Returns null if the layer has no valid data at that point.
 */
function interpolate(
  layer: (number | null)[][],
  lats: number[],
  lons: number[],
  resolution: number,
  latitude: number,
  longitude: number,
): number | null {
  const lat = Math.max(lats[lats.length - 1], Math.min(lats[0], latitude));
  const lon = Math.max(lons[0],               Math.min(lons[lons.length - 1], longitude));

  let i0 = 0;
  for (let i = 0; i < lats.length - 1; i++) {
    if (lats[i] >= lat && lats[i + 1] <= lat) { i0 = i; break; }
  }
  let j0 = 0;
  for (let j = 0; j < lons.length - 1; j++) {
    if (lons[j] <= lon && lons[j + 1] >= lon) { j0 = j; break; }
  }

  const i1 = Math.min(i0 + 1, lats.length - 2);
  const j1 = Math.min(j0 + 1, lons.length - 2);

  const wLat = (lats[i0] - lat) / resolution;
  const wLon = (lon - lons[j0]) / resolution;

  const v00 = layer[i0]?.[j0] ?? 0;  // null (polar edge) → 0
  const v01 = layer[i0]?.[j1] ?? 0;
  const v10 = layer[i1]?.[j0] ?? 0;
  const v11 = layer[i1]?.[j1] ?? 0;

  const result =
    v00 * (1 - wLat) * (1 - wLon) +
    v01 * (1 - wLat) *      wLon  +
    v10 *      wLat  * (1 - wLon) +
    v11 *      wLat  *      wLon;

  return parseFloat(result.toFixed(2));
}

/**
 * Return the climate delta for a specific location, scenario, and calendar month.
 * month: 0 = January, 11 = December  (matches JS Date.getMonth())
 *
 * prDeltaPct is null when model agreement is below the dataset's threshold,
 * indicating the precipitation signal should be shown as uncertain (hatched).
 */
export function getDeltaForLocation(
  latitude: number,
  longitude: number,
  scenario: Scenario,
  month: number,
): DeltaResult {
  const d = getDeltas(scenario, latitude, longitude);
  const { lats, lons, resolution, tas, pr } = d;

  const tasDelta = interpolate(
    tas.monthly_delta[month], lats, lons, resolution, latitude, longitude,
  ) ?? 0;

  const prDeltaPct = interpolate(
    pr.monthly_delta_pct[month], lats, lons, resolution, latitude, longitude,
  );

  const agreement = interpolate(
    pr.monthly_agreement[month], lats, lons, resolution, latitude, longitude,
  ) ?? 0;

  return {
    tasDelta,
    prDeltaPct: agreement >= d.agreement_threshold ? prDeltaPct : null,
  };
}

/**
 * Return deltas for both scenarios for a given location and month.
 * Used by the chart view to draw all three lines simultaneously.
 */
export function getBothDeltas(
  latitude: number,
  longitude: number,
  month: number,
): { ssp245: DeltaResult; ssp585: DeltaResult } {
  return {
    ssp245: getDeltaForLocation(latitude, longitude, 'ssp245', month),
    ssp585: getDeltaForLocation(latitude, longitude, 'ssp585', month),
  };
}
