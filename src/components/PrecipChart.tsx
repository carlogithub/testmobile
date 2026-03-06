import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Rect, Line, Defs, Pattern, Text as SvgText, G,
} from 'react-native-svg';
import { DayForecast } from '../types';

interface Props {
  forecast: DayForecast[];
  /** % change for SSP2-4.5; null = model agreement below threshold */
  prDeltaPct245: number | null;
  /** % change for SSP5-8.5; null = model agreement below threshold */
  prDeltaPct585: number | null;
}

const ORANGE  = '#FF6B35';
const BLUE    = '#4A90D9';
const RED     = '#C0392B';
const GREY_AX = '#DDDDDD';
const LABEL_C = '#999999';

const PAD = { top: 16, right: 16, bottom: 48, left: 40 };
const HATCH_ID_245 = 'hatch245';
const HATCH_ID_585 = 'hatch585';

function applyPct(base: number, pct: number | null): number | null {
  if (pct === null) return null;
  return Math.max(0, Math.round((base * (1 + pct / 100)) * 10) / 10);
}

export default function PrecipChart({ forecast, prDeltaPct245, prDeltaPct585 }: Props) {
  const svgWidth  = 340;
  const svgHeight = 200;
  const chartW = svgWidth  - PAD.left - PAD.right;
  const chartH = svgHeight - PAD.top  - PAD.bottom;

  const n       = forecast.length;
  const groupW  = chartW / n;
  const barW    = groupW * 0.22;
  const gap     = groupW * 0.04;

  const todayPrecip = forecast.map(d => d.precipMm);
  const p245        = forecast.map(d => applyPct(d.precipMm, prDeltaPct245));
  const p585        = forecast.map(d => applyPct(d.precipMm, prDeltaPct585));

  const allDefined  = [...todayPrecip, ...p245.map(v => v ?? 0), ...p585.map(v => v ?? 0)];
  const maxV        = Math.max(...allDefined, 1);

  // Y-axis ticks
  const tickStep = maxV <= 5 ? 1 : maxV <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= maxV + tickStep; t += tickStep) ticks.push(t);

  const yPos = (v: number) => PAD.top + (1 - v / (ticks[ticks.length - 1])) * chartH;

  const barX = (groupIdx: number, barIdx: number) =>
    PAD.left + groupIdx * groupW + (groupW - 3 * barW - 2 * gap) / 2 + barIdx * (barW + gap);

  const dayLabels = forecast.map(d => d.dayLabel.slice(0, 3));

  return (
    <View style={styles.wrapper}>
      <Svg width={svgWidth} height={svgHeight}>
        <Defs>
          {/* Diagonal hatch pattern for uncertain bars */}
          <Pattern id={HATCH_ID_245} patternUnits="userSpaceOnUse" width={6} height={6}>
            <Rect width={6} height={6} fill={`${BLUE}33`} />
            <Line x1={0} y1={6} x2={6} y2={0} stroke={BLUE} strokeWidth={1.2} />
          </Pattern>
          <Pattern id={HATCH_ID_585} patternUnits="userSpaceOnUse" width={6} height={6}>
            <Rect width={6} height={6} fill={`${RED}33`} />
            <Line x1={0} y1={6} x2={6} y2={0} stroke={RED} strokeWidth={1.2} />
          </Pattern>
        </Defs>

        {/* Y-axis grid + labels */}
        {ticks.map(t => (
          <G key={t}>
            <Line
              x1={PAD.left} y1={yPos(t)}
              x2={PAD.left + chartW} y2={yPos(t)}
              stroke={GREY_AX} strokeWidth={1}
            />
            <SvgText
              x={PAD.left - 5} y={yPos(t) + 4}
              fontSize={10} fill={LABEL_C} textAnchor="end"
            >
              {t}
            </SvgText>
          </G>
        ))}

        {/* Bars per day */}
        {forecast.map((day, i) => {
          const today   = todayPrecip[i];
          const fut245  = p245[i];
          const fut585  = p585[i];
          const maxTick = ticks[ticks.length - 1];

          const todayH  = (today / maxTick) * chartH;
          const h245    = fut245 !== null ? (fut245 / maxTick) * chartH : 0;
          const h585    = fut585 !== null ? (fut585 / maxTick) * chartH : 0;

          return (
            <G key={day.date}>
              {/* Today bar — orange */}
              <Rect
                x={barX(i, 0)} y={yPos(today)}
                width={barW} height={todayH}
                fill={ORANGE} rx={2}
              />

              {/* SSP2-4.5 bar — solid blue or hatched */}
              <Rect
                x={barX(i, 1)} y={fut245 !== null ? yPos(fut245) : PAD.top + chartH}
                width={barW} height={h245}
                fill={prDeltaPct245 !== null ? BLUE : `url(#${HATCH_ID_245})`}
                opacity={prDeltaPct245 !== null ? 0.8 : 1}
                rx={2}
              />
              {prDeltaPct245 === null && h245 > 0 && (
                /* Explicit hatch overlay when uncertain */
                <Rect
                  x={barX(i, 1)} y={PAD.top + chartH - h245}
                  width={barW} height={h245}
                  fill={`url(#${HATCH_ID_245})`} rx={2}
                />
              )}

              {/* SSP5-8.5 bar — solid red or hatched */}
              <Rect
                x={barX(i, 2)} y={fut585 !== null ? yPos(fut585) : PAD.top + chartH}
                width={barW} height={h585}
                fill={prDeltaPct585 !== null ? RED : `url(#${HATCH_ID_585})`}
                opacity={prDeltaPct585 !== null ? 0.8 : 1}
                rx={2}
              />
              {prDeltaPct585 === null && h585 > 0 && (
                <Rect
                  x={barX(i, 2)} y={PAD.top + chartH - h585}
                  width={barW} height={h585}
                  fill={`url(#${HATCH_ID_585})`} rx={2}
                />
              )}

              {/* Day label */}
              <SvgText
                x={PAD.left + i * groupW + groupW / 2}
                y={svgHeight - 30}
                fontSize={10} fill={LABEL_C} textAnchor="middle"
              >
                {dayLabels[i]}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendBar color={ORANGE} label="Today" hatched={false} />
        <LegendBar color={BLUE}   label="2050 SSP2-4.5" hatched={prDeltaPct245 === null} />
        <LegendBar color={RED}    label="2050 SSP5-8.5" hatched={prDeltaPct585 === null} />
      </View>
      <Text style={styles.yLabel}>Precip (mm/day)</Text>
      {(prDeltaPct245 === null || prDeltaPct585 === null) && (
        <Text style={styles.uncertainNote}>
          Hatched bars: model agreement below 66% — signal uncertain
        </Text>
      )}
    </View>
  );
}

function LegendBar({ color, label, hatched }: { color: string; label: string; hatched: boolean }) {
  return (
    <View style={styles.legendItem}>
      <Svg width={14} height={14}>
        <Rect width={14} height={14} fill={hatched ? `${color}33` : color} rx={2} />
        {hatched && (
          <>
            <Line x1={0} y1={14} x2={14} y2={0} stroke={color} strokeWidth={1.2} />
            <Line x1={-4} y1={10} x2={10} y2={-4} stroke={color} strokeWidth={1.2} />
            <Line x1={4} y1={18} x2={18} y2={4} stroke={color} strokeWidth={1.2} />
          </>
        )}
      </Svg>
      <Text style={[styles.legendLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  yLabel: {
    fontSize: 10,
    color: '#BBB',
    marginTop: 4,
  },
  uncertainNote: {
    fontSize: 10,
    color: '#BBB',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
    fontStyle: 'italic',
  },
});
