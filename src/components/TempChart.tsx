import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Polyline, Circle, Text as SvgText, Rect } from 'react-native-svg';
import { DayForecast } from '../types';

interface Props {
  forecast: DayForecast[];
  /** Per-day tas deltas for SSP2-4.5 (one per forecast day, using that day's month) */
  tasDeltas245: number[];
  /** Per-day tas deltas for SSP5-8.5 */
  tasDeltas585: number[];
}

const ORANGE   = '#FF6B35';
const BLUE     = '#4A90D9';
const RED      = '#C0392B';
const GREY_AX  = '#DDDDDD';
const LABEL_C  = '#999999';

const PAD = { top: 24, right: 16, bottom: 48, left: 40 };

function toPoints(values: number[], w: number, h: number, minV: number, maxV: number): string {
  const range = maxV - minV || 1;
  return values
    .map((v, i) => {
      const x = PAD.left + (i / (values.length - 1)) * w;
      const y = PAD.top  + (1 - (v - minV) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function TempChart({ forecast, tasDeltas245, tasDeltas585 }: Props) {
  const svgWidth  = 340;
  const svgHeight = 220;
  const chartW = svgWidth  - PAD.left - PAD.right;
  const chartH = svgHeight - PAD.top  - PAD.bottom;

  const todayMaxes  = forecast.map(d => d.maxTemp);
  const future245   = forecast.map((d, i) => Math.round(d.maxTemp + (tasDeltas245[i] ?? 0)));
  const future585   = forecast.map((d, i) => Math.round(d.maxTemp + (tasDeltas585[i] ?? 0)));

  const allValues = [...todayMaxes, ...future245, ...future585];
  const minV = Math.floor(Math.min(...allValues)) - 1;
  const maxV = Math.ceil( Math.max(...allValues)) + 1;

  // Y-axis tick values
  const tickCount = 5;
  const step = Math.ceil((maxV - minV) / tickCount);
  const ticks: number[] = [];
  for (let t = minV; t <= maxV; t += step) ticks.push(t);

  const yPos = (v: number) =>
    PAD.top + (1 - (v - minV) / (maxV - minV)) * chartH;

  const points = {
    today: toPoints(todayMaxes, chartW, chartH, minV, maxV),
    s245:  toPoints(future245,  chartW, chartH, minV, maxV),
    s585:  toPoints(future585,  chartW, chartH, minV, maxV),
  };

  const dayLabels = forecast.map(d => d.dayLabel.slice(0, 3));

  return (
    <View style={styles.wrapper}>
      <Svg width={svgWidth} height={svgHeight}>
        {/* Y-axis grid lines + labels */}
        {ticks.map(t => (
          <React.Fragment key={t}>
            <Line
              x1={PAD.left} y1={yPos(t)}
              x2={PAD.left + chartW} y2={yPos(t)}
              stroke={GREY_AX} strokeWidth={1}
            />
            <SvgText
              x={PAD.left - 6} y={yPos(t) + 4}
              fontSize={10} fill={LABEL_C} textAnchor="end"
            >
              {t}°
            </SvgText>
          </React.Fragment>
        ))}

        {/* X-axis day labels */}
        {dayLabels.map((label, i) => {
          const x = PAD.left + (i / (dayLabels.length - 1)) * chartW;
          return (
            <SvgText
              key={i}
              x={x} y={svgHeight - 30}
              fontSize={10} fill={LABEL_C} textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}

        {/* Today line (orange) */}
        <Polyline
          points={points.today}
          fill="none" stroke={ORANGE} strokeWidth={2.5} strokeLinejoin="round"
        />

        {/* SSP2-4.5 line (blue) */}
        <Polyline
          points={points.s245}
          fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round"
          strokeDasharray="6,3"
        />

        {/* SSP5-8.5 line (red) */}
        <Polyline
          points={points.s585}
          fill="none" stroke={RED} strokeWidth={2} strokeLinejoin="round"
          strokeDasharray="2,3"
        />

        {/* Dots on today line */}
        {todayMaxes.map((v, i) => {
          const x = PAD.left + (i / (todayMaxes.length - 1)) * chartW;
          return (
            <Circle
              key={i} cx={x} cy={yPos(v)} r={3}
              fill="#fff" stroke={ORANGE} strokeWidth={2}
            />
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color={ORANGE} dash={false} label="Today" />
        <LegendItem color={BLUE}   dash  label="2050 SSP2-4.5" />
        <LegendItem color={RED}    dash  label="2050 SSP5-8.5" />
      </View>

      <Text style={styles.yAxisLabel}>Max temp (°C)</Text>
    </View>
  );
}

function LegendItem({ color, dash, label }: { color: string; dash: boolean; label: string }) {
  return (
    <View style={styles.legendItem}>
      <Svg width={24} height={12}>
        <Line
          x1={0} y1={6} x2={24} y2={6}
          stroke={color} strokeWidth={2}
          strokeDasharray={dash ? '5,3' : undefined}
        />
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
    gap: 16,
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
  yAxisLabel: {
    fontSize: 10,
    color: '#BBB',
    marginTop: 6,
  },
});
