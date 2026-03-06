import { ClimateDeltas, DeltaResult, Scenario } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DELTAS_SSP245: ClimateDeltas = require('../../assets/data/delta_ssp245.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DELTAS_SSP585: ClimateDeltas = require('../../assets/data/delta_ssp585.json');

function getDeltas(scenario: Scenario): ClimateDeltas {
  return scenario === 'ssp245' ? DELTAS_SSP245 : DELTAS_SSP585;
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
  const d = getDeltas(scenario);
  const { lats, lons, resolution, tas, pr } = d;

  // Placeholder JSON not yet replaced — return a plausible default
  if (!tas?.monthly_delta) {
    return {
      tasDelta:   scenario === 'ssp245' ? 1.5 : 2.5,
      prDeltaPct: null,
    };
  }

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
