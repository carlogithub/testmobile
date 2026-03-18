import { AnomalyResult, DeltaResult } from '../types';

export type ConsistencyStatus = 'consistent' | 'counter' | 'uncertain' | 'neutral';

export interface ConsistencyResult {
  status: ConsistencyStatus;
  /** Short human-readable sentence. Empty string when status is 'neutral'. */
  message: string;
}

/**
 * Check whether a temperature anomaly is consistent with the projected
 * warming/cooling signal from CMIP6/CORDEX.
 *
 * Only fires for anomalies outside the 25–75th-percentile "normal" band.
 * Uses SSP5-8.5 delta as the reference direction (strongest signal).
 */
export function checkTempConsistency(
  anomaly: AnomalyResult,
  delta: DeltaResult,
): ConsistencyResult {
  const { percentile } = anomaly;
  const { tasDelta }   = delta;

  // Inside normal range → say nothing
  if (percentile > 25 && percentile < 75) {
    return { status: 'neutral', message: '' };
  }

  const sign      = tasDelta >= 0 ? +1 : -1;
  const absDelta  = Math.abs(tasDelta).toFixed(1);
  const direction = tasDelta >= 0 ? `+${absDelta}°C warming` : `−${absDelta}°C cooling`;

  // Warm anomaly + warming signal  OR  cold anomaly + cooling signal → consistent
  if (percentile >= 75 && sign > 0) {
    return {
      status: 'consistent',
      message: `Aligns with CMIP6 projected ${direction} by ~2050`,
    };
  }
  if (percentile <= 25 && sign < 0) {
    return {
      status: 'consistent',
      message: `Aligns with CMIP6 projected ${direction} by ~2050`,
    };
  }

  // Opposite direction → counter
  if (percentile >= 75 && sign < 0) {
    return {
      status: 'counter',
      message: `Counter to CMIP6 projected ${direction} by ~2050`,
    };
  }
  // percentile <= 25 && sign > 0
  return {
    status: 'counter',
    message: `Counter to CMIP6 projected ${direction} by ~2050`,
  };
}

/**
 * Check whether a precipitation anomaly is consistent with the projected
 * wetting/drying signal.
 *
 * When prDeltaPct is null the models disagree on direction — always uncertain.
 */
export function checkPrecipConsistency(
  anomaly: AnomalyResult,
  delta: DeltaResult,
): ConsistencyResult {
  const { percentile } = anomaly;
  const { prDeltaPct } = delta;

  if (percentile > 25 && percentile < 75) {
    return { status: 'neutral', message: '' };
  }

  if (prDeltaPct === null) {
    return {
      status: 'uncertain',
      message: 'CMIP6 models disagree on precipitation trend here',
    };
  }

  const absPct   = Math.abs(prDeltaPct).toFixed(0);
  const trend    = prDeltaPct >= 0 ? `+${absPct}% wetting` : `−${absPct}% drying`;
  const sign     = prDeltaPct >= 0 ? +1 : -1;

  if (percentile >= 75 && sign > 0) {
    return {
      status: 'consistent',
      message: `Aligns with CMIP6 projected ${trend} by ~2050`,
    };
  }
  if (percentile <= 25 && sign < 0) {
    return {
      status: 'consistent',
      message: `Aligns with CMIP6 projected ${trend} by ~2050`,
    };
  }
  if (percentile >= 75 && sign < 0) {
    return {
      status: 'counter',
      message: `Counter to CMIP6 projected ${trend} by ~2050`,
    };
  }
  return {
    status: 'counter',
    message: `Counter to CMIP6 projected ${trend} by ~2050`,
  };
}
