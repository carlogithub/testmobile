import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DayForecast } from '../types';
import { weatherCodeToDisplay } from '../services/weatherApi';

interface Props {
  today: DayForecast;
  future: DayForecast;
  delta: number;
  isFirst?: boolean;
}

export default function DayForecastRow({ today, future, delta, isFirst }: Props) {
  const { emoji } = weatherCodeToDisplay(today.weatherCode);

  return (
    <View style={[styles.row, isFirst && styles.firstRow]}>
      {/* Day label + icon */}
      <View style={styles.dayCol}>
        <Text style={styles.dayLabel}>{today.dayLabel}</Text>
        <Text style={styles.icon}>{emoji}</Text>
      </View>

      {/* Today temps */}
      <View style={styles.tempCol}>
        <Text style={styles.colHeader}>Today</Text>
        <Text style={styles.tempHigh}>{today.maxTemp}°</Text>
        <Text style={styles.tempLow}>{today.minTemp}°</Text>
      </View>

      {/* Arrow */}
      <Text style={styles.arrow}>→</Text>

      {/* 2050 temps */}
      <View style={[styles.tempCol, styles.futureCol]}>
        <Text style={[styles.colHeader, styles.futureHeader]}>2050</Text>
        <Text style={[styles.tempHigh, styles.futureHigh]}>{future.maxTemp}°</Text>
        <Text style={[styles.tempLow, styles.futureLow]}>{future.minTemp}°</Text>
      </View>

      {/* Delta badge */}
      <View style={[styles.deltaBadge, delta >= 0 ? styles.deltaPos : styles.deltaNeg]}>
        <Text style={styles.deltaText}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}°
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
  },
  firstRow: {
    borderTopWidth: 0,
  },
  dayCol: {
    width: 56,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  icon: {
    fontSize: 20,
    marginTop: 2,
  },
  tempCol: {
    flex: 1,
    alignItems: 'center',
  },
  futureCol: {
    backgroundColor: '#FFF5F0',
    borderRadius: 8,
    paddingVertical: 4,
  },
  colHeader: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  futureHeader: {
    color: '#FF6B35',
  },
  tempHigh: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  futureHigh: {
    color: '#D44000',
  },
  tempLow: {
    fontSize: 13,
    color: '#888',
  },
  futureLow: {
    color: '#E07050',
  },
  arrow: {
    fontSize: 14,
    color: '#CCC',
    marginHorizontal: 4,
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
    minWidth: 48,
    alignItems: 'center',
  },
  deltaPos: {
    backgroundColor: '#FFE8E0',
  },
  deltaNeg: {
    backgroundColor: '#E0F0FF',
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D44000',
  },
});
