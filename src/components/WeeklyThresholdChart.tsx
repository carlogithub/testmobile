/**
 * WeeklyThresholdChart
 *
 * Shows a 7-day paired bar chart (today vs 2050 SSP2-4.5) with two
 * horizontal dashed threshold lines drawn from the local ERA5 history:
 *   - Red dashed line  = 90th percentile ("hot day" / "heavy rain day")
 *   - Blue dashed line = 10th percentile ("cold day") — temperature only
 *
 * The headline above the chart counts how many forecast days cross each
 * threshold today versus in 2050, making the climate signal concrete:
 *   "2 → 5 hot days this week  (above 23°C)"
 *
 * While the ERA5 data is still loading the threshold lines are hidden
 * and the headline shows a neutral placeholder — the bars are always
 * visible immediately from the forecast data.
 */

import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { DayForecast } from '../types';
import { WeeklyThresholds } from '../services/climateContext';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  forecast:      DayForecast[];
  /** Raw forecast values for each of the 7 days (today's scenario) */
  todayValues:   number[];
  /** 2050 SSP2-4.5 values — null means the precipitation signal is uncertain */
  futureValues:  (number | null)[];
  /** ERA5-derived thresholds; null while data is still loading */
  thresholds:    WeeklyThresholds | null;
  /** Unit shown on y-axis and in the headline, e.g. '°C' or 'mm' */
  unit:          string;
  /** Section heading, e.g. 'Temperature this week' */
  title:         string;
  /** Whether this chart is for precipitation (changes baseline and label copy) */
  isPrecip?:     boolean;
}

// ── Colour constants ──────────────────────────────────────────────────────────

const TODAY_BAR   = '#90CAF9'; // light blue  — today's forecast
const FUTURE_BAR  = '#FF6B35'; // orange      — 2050 projection
const HOT_COLOR   = '#E53935'; // red         — 90th pct threshold line
const COLD_COLOR  = '#1976D2'; // blue        — 10th pct threshold line
const AXIS_COLOR  = '#DDDDDD';
const LABEL_COLOR = '#999999';

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeeklyThresholdChart({
  forecast, todayValues, futureValues,
  thresholds, unit, title, isPrecip = false,
}: Props) {

  // useWindowDimensions gives us the current screen width so the chart
  // scales correctly on every phone size.
  const { width: screenWidth } = useWindowDimensions();

  // ── Layout geometry ───────────────────────────────────────────────────────
  // The chart lives inside a card with 16px margin on each side and 16px
  // internal padding.  We subtract all that to get the drawable SVG width.

  const CARD_MARGIN  = 16;   // gap between screen edge and card
  const CARD_PADDING = 16;   // padding inside the card
  const LEFT_AXIS    = 38;   // room for y-axis labels on the left
  const RIGHT_PAD    = 8;    // small breathing room on the right
  const TOP_PAD      = 6;    // space above the bars
  const BOTTOM_PAD   = 20;   // space below bars for day-of-week labels
  const CHART_H      = 130;  // height of the bar area in pixels

  const svgWidth   = screenWidth - 2 * (CARD_MARGIN + CARD_PADDING);
  const chartWidth = svgWidth - LEFT_AXIS - RIGHT_PAD;
  const svgHeight  = TOP_PAD + CHART_H + BOTTOM_PAD;

  // ── Y-axis range ──────────────────────────────────────────────────────────
  // We include the threshold values in the range so the lines are always visible.

  const validFuture = futureValues.map(v => v ?? 0);
  const allValues   = [...todayValues, ...validFuture];
  const threshVals  = thresholds
    ? (isPrecip ? [thresholds.precip90] : [thresholds.tmax90, thresholds.tmax10])
    : [];

  const allForRange = [...allValues, ...threshVals];
  // Precipitation bars always start from zero.
  // Temperature bars use a tight range (we don't start from 0°C).
  const rawMin = isPrecip ? 0 : Math.min(...allForRange);
  const rawMax = Math.max(...allForRange);
  const minY   = rawMin - (isPrecip ? 0 : 2);  // 2° breathing room below
  const maxY   = rawMax + (isPrecip ? 1 : 2);  // small breathing room above
  const range  = maxY - minY || 1;              // guard against divide-by-zero

  // Convert a data value to a y pixel coordinate within the SVG.
  // In SVG, y=0 is the top, so higher values get a smaller y number.
  const toY = (v: number) =>
    TOP_PAD + CHART_H * (1 - (v - minY) / range);

  // The bottom of every bar (the baseline) — bottom of chart area
  const barBottom = TOP_PAD + CHART_H;

  // ── Bar layout ────────────────────────────────────────────────────────────
  // Each day gets a slot of equal width.  Within each slot there are two
  // bars side by side: today (left) and 2050 (right).

  const daySlotW = chartWidth / 7;
  // barW: each bar takes ~32% of the slot width, minimum 4px
  const barW     = Math.max(4, daySlotW * 0.32);
  const barGap   = 2; // pixel gap between the two bars in a pair

  // X position of the left edge of each bar
  const todayBarX  = (i: number) => {
    const slotX      = LEFT_AXIS + i * daySlotW;
    const pairWidth  = 2 * barW + barGap;
    return slotX + (daySlotW - pairWidth) / 2; // centre the pair in the slot
  };
  const futureBarX = (i: number) => todayBarX(i) + barW + barGap;

  // ── Threshold crossing counts ─────────────────────────────────────────────
  // These feed the headline: "2 → 5 hot days this week"

  const above90Today  = thresholds ? todayValues.filter(v => v > thresholds.tmax90).length  : 0;
  const above90Future = thresholds ? validFuture.filter(v => v > thresholds.tmax90).length  : 0;
  const below10Today  = thresholds ? todayValues.filter(v => v < thresholds.tmax10).length  : 0;
  const below10Future = thresholds ? validFuture.filter(v => v < thresholds.tmax10).length  : 0;
  const heavyToday    = thresholds ? todayValues.filter(v => v > thresholds.precip90).length : 0;
  const heavyFuture   = thresholds ? validFuture.filter(v => v > thresholds.precip90).length : 0;

  // ── Headline text ─────────────────────────────────────────────────────────
  // We pick the most relevant threshold to highlight.
  // For temperature: prefer hot days in summer, cold days in winter.
  // For precipitation: always heavy rain days.

  let headline      = '';
  let headlineColor = '#1A1A2E';
  let subtext       = '';

  if (!thresholds) {
    // ERA5 still loading — show neutral placeholder
    headline      = 'Loading climate thresholds…';
    headlineColor = LABEL_COLOR;

  } else if (isPrecip) {
    const t = thresholds.precip90.toFixed(1);
    if (heavyToday === 0 && heavyFuture === 0) {
      headline = 'No heavy rain days forecast this week';
      headlineColor = '#2E7D32';
    } else {
      headline      = `${heavyToday} → ${heavyFuture} heavy rain ${heavyFuture === 1 ? 'day' : 'days'} this week`;
      headlineColor = heavyFuture > heavyToday ? HOT_COLOR : '#2E7D32';
      subtext       = `above ${t} mm — your local 90th percentile`;
    }

  } else {
    // Temperature: decide whether hot or cold days are more relevant
    // by checking which signal is larger
    const hotSignal  = above90Future - above90Today;
    const coldSignal = below10Today  - below10Future; // fewer cold days = warming signal

    if (hotSignal >= coldSignal) {
      const t = thresholds.tmax90.toFixed(1);
      if (above90Today === 0 && above90Future === 0) {
        headline      = 'No hot days forecast this week';
        headlineColor = '#2E7D32';
        subtext       = `hot day threshold: above ${t}°C`;
      } else {
        headline      = `${above90Today} → ${above90Future} hot ${above90Future === 1 ? 'day' : 'days'} this week`;
        headlineColor = above90Future > above90Today ? HOT_COLOR : '#2E7D32';
        subtext       = `above ${t}°C — your local 90th percentile`;
      }
    } else {
      const t = thresholds.tmax10.toFixed(1);
      headline      = `${below10Today} → ${below10Future} cold ${below10Future === 1 ? 'day' : 'days'} this week`;
      headlineColor = below10Future < below10Today ? HOT_COLOR : COLD_COLOR;
      subtext       = `below ${t}°C — your local 10th percentile`;
    }
  }

  // The threshold values to draw on this chart
  const line90 = thresholds ? (isPrecip ? thresholds.precip90 : thresholds.tmax90) : null;
  const line10 = (!isPrecip && thresholds) ? thresholds.tmax10 : null;

  // ── Y-axis tick labels ────────────────────────────────────────────────────
  // Three ticks: bottom, middle, top of the chart area
  const yTicks = [minY, (minY + maxY) / 2, maxY];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>

      {/* Section title */}
      <Text style={styles.title}>{title}</Text>

      {/* Headline — the key number the user should take away */}
      <Text style={[styles.headline, { color: headlineColor }]}>{headline}</Text>
      {subtext !== '' && (
        <Text style={styles.subtext}>{subtext}</Text>
      )}

      {/* Legend — explains bar colours */}
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: TODAY_BAR }]} />
        <Text style={styles.legendLabel}>This week (forecast)</Text>
        <View style={[styles.swatch, { backgroundColor: FUTURE_BAR }]} />
        <Text style={styles.legendLabel}>2050 · SSP2-4.5</Text>
      </View>

      {/* SVG chart */}
      <Svg width={svgWidth} height={svgHeight}>

        {/* Y-axis grid lines and labels */}
        {yTicks.map((v, idx) => (
          <React.Fragment key={idx}>
            <Line
              x1={LEFT_AXIS} y1={toY(v)}
              x2={LEFT_AXIS + chartWidth} y2={toY(v)}
              stroke={AXIS_COLOR} strokeWidth={0.5}
            />
            <SvgText
              x={LEFT_AXIS - 4} y={toY(v) + 4}
              fontSize={9} fill={LABEL_COLOR} textAnchor="end"
            >
              {isPrecip ? v.toFixed(1) : Math.round(v).toString()}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Bars — one pair per forecast day */}
        {forecast.map((day, i) => {
          const todayV  = todayValues[i];
          const futureV = futureValues[i];

          // Bar y and height — bars grow upward from barBottom (baseline)
          const todayBarTopY  = toY(todayV);
          const todayBarH     = Math.max(0, barBottom - todayBarTopY);

          return (
            <React.Fragment key={day.date}>

              {/* Today's bar */}
              <Rect
                x={todayBarX(i)} y={todayBarTopY}
                width={barW} height={todayBarH}
                fill={TODAY_BAR} rx={2}
              />

              {/* 2050 bar — omitted if value is null (uncertain precip signal) */}
              {futureV !== null && (
                <Rect
                  x={futureBarX(i)} y={toY(futureV)}
                  width={barW} height={Math.max(0, barBottom - toY(futureV))}
                  fill={FUTURE_BAR} rx={2} opacity={0.9}
                />
              )}

              {/* Day-of-week label below bars */}
              <SvgText
                x={LEFT_AXIS + (i + 0.5) * daySlotW}
                y={svgHeight - 4}
                fontSize={9} fill={LABEL_COLOR} textAnchor="middle"
              >
                {day.dayLabel.slice(0, 3)}
              </SvgText>

            </React.Fragment>
          );
        })}

        {/* 90th percentile threshold line (hot / heavy rain) */}
        {line90 !== null && (
          <>
            <Line
              x1={LEFT_AXIS} y1={toY(line90)}
              x2={LEFT_AXIS + chartWidth} y2={toY(line90)}
              stroke={HOT_COLOR} strokeWidth={1.5} strokeDasharray="5 3"
            />
            <SvgText
              x={LEFT_AXIS + chartWidth - 2} y={toY(line90) - 3}
              fontSize={8} fill={HOT_COLOR} textAnchor="end"
            >
              {isPrecip ? 'heavy rain' : 'hot day'}
            </SvgText>
          </>
        )}

        {/* 10th percentile threshold line (cold) — temperature only */}
        {line10 !== null && (
          <>
            <Line
              x1={LEFT_AXIS} y1={toY(line10)}
              x2={LEFT_AXIS + chartWidth} y2={toY(line10)}
              stroke={COLD_COLOR} strokeWidth={1.5} strokeDasharray="5 3"
            />
            <SvgText
              x={LEFT_AXIS + chartWidth - 2} y={toY(line10) - 3}
              fontSize={8} fill={COLD_COLOR} textAnchor="end"
            >
              cold day
            </SvgText>
          </>
        )}

      </Svg>

      {/* Source note — appears once thresholds are loaded */}
      {thresholds && (
        <Text style={styles.sourceNote}>
          Thresholds from ERA5 reanalysis 1979–2024 · ±15-day seasonal window · your location
        </Text>
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
                 shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },

  title: {
    fontSize: 13, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10,
  },

  // The big take-away number — largest text in the card
  headline: {
    fontSize: 18, fontWeight: '800', color: '#1A1A2E',
    lineHeight: 24, marginBottom: 2,
  },

  // Explains what the headline number means in plain English
  subtext: {
    fontSize: 12, color: '#888', marginBottom: 8,
  },

  legend: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginBottom: 8, flexWrap: 'wrap',
  },
  swatch: {
    width: 12, height: 12, borderRadius: 3,
  },
  legendLabel: {
    fontSize: 11, color: '#888', marginRight: 8,
  },

  sourceNote: {
    marginTop: 6,
    fontSize: 10, color: '#CCC', textAlign: 'center',
  },
});
