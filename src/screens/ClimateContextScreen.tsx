import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DayForecast, DayClimateContext, DeltaResult } from '../types';
import { getClimateContext } from '../services/climateContext';
import { getDeltaForLocation } from '../services/climateDelta';
import { checkTempConsistency, checkPrecipConsistency } from '../services/consistencyCheck';
import AnomalyBadge from '../components/AnomalyBadge';
import ConsistencyChip from '../components/ConsistencyChip';
import { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'ClimateContext'>;

const VARS: { key: keyof DayClimateContext; label: string; unit: string; value: (d: DayForecast) => number }[] = [
  { key: 'tmax',   label: 'Max temp',   unit: '°C',  value: d => d.maxTemp   },
  { key: 'tmin',   label: 'Min temp',   unit: '°C',  value: d => d.minTemp   },
  { key: 'precip', label: 'Precip',     unit: 'mm',  value: d => d.precipMm  },
  { key: 'wind',   label: 'Max wind',   unit: 'm/s', value: d => d.windSpeed },
];

export default function ClimateContextScreen({ route, navigation }: Props) {
  const { location, forecast } = route.params;

  const [context,  setContext]  = useState<DayClimateContext[] | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // SSP5-8.5 deltas per day (sync, from bundled JSON) — used for consistency check
  const deltasPerDay: DeltaResult[] = forecast.slice(0, 4).map(day => {
    const month = new Date(day.date + 'T12:00:00').getMonth();
    return getDeltaForLocation(location.latitude, location.longitude, 'ssp585', month);
  });

  useEffect(() => {
    getClimateContext(location.latitude, location.longitude, forecast)
      .then(ctx => { setContext(ctx); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Climate Context</Text>
          <Text style={styles.subtitle}>{location.cityName}</Text>
        </View>
      </View>

      {loading && (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.loadingText}>
            Fetching ERA5 climate history…{'\n'}
            <Text style={styles.loadingSmall}>
              (first load may take ~30 s)
            </Text>
          </Text>
        </View>
      )}

      {!!error && (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && context && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.explainer}>
            How unusual is this weather compared to ERA5 historical data
            (1979–2024) for the same time of year (±15 days)?
          </Text>

          {context.map((dayCtx, i) => {
            const day   = forecast[i];
            const delta = deltasPerDay[i];
            const dateLabel = i === 0
              ? 'Today'
              : new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                });

            // Consistency results — only for temp and precip (no CMIP6 wind projection)
            const tempConsistency   = dayCtx.tmax   ? checkTempConsistency(dayCtx.tmax, delta)   : null;
            const precipConsistency = dayCtx.precip ? checkPrecipConsistency(dayCtx.precip, delta) : null;

            return (
              <View key={dayCtx.date} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{dateLabel}</Text>
                  <Text style={styles.daySamples}>{dayCtx.nSamples} historical days</Text>
                </View>

                {VARS.map(({ key, label, unit, value }) => (
                  <View key={key} style={styles.varBlock}>
                    <View style={styles.varRow}>
                      <Text style={styles.varLabel}>{label}</Text>
                      <Text style={styles.varValue}>
                        {value(day).toFixed(1)} {unit}
                      </Text>
                      <AnomalyBadge anomaly={dayCtx[key] as any} />
                    </View>
                    {key === 'tmax'   && tempConsistency   && (
                      <ConsistencyChip result={tempConsistency} />
                    )}
                    {key === 'precip' && precipConsistency && (
                      <ConsistencyChip result={precipConsistency} />
                    )}
                  </View>
                ))}
              </View>
            );
          })}

          <Text style={styles.footnote}>
            Percentiles: Open-Meteo / ERA5 reanalysis, ±15-day window, 1979–2024.{'\n'}
            Trend consistency: CMIP6/CORDEX SSP5-8.5 delta vs ERA5 baseline.{'\n'}
            Single-day weather ≠ climate signal — direction only.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const ORANGE = '#FF6B35';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  backBtn:      { paddingRight: 16, paddingVertical: 4 },
  backText:     { fontSize: 17, color: ORANGE, fontWeight: '600' },
  headerTitles: { flex: 1 },
  title:        { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  subtitle:     { fontSize: 13, color: '#888', marginTop: 1 },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText:  { marginTop: 16, fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  loadingSmall: { fontSize: 13, color: '#999' },
  errorText:    { fontSize: 15, color: '#c0392b', textAlign: 'center' },

  scroll: { padding: 16, paddingBottom: 40 },

  explainer: {
    fontSize: 13, color: '#888', lineHeight: 18,
    marginBottom: 16, textAlign: 'center',
  },

  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
    }),
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dayLabel:   { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  daySamples: { fontSize: 11, color: '#BBB' },

  varBlock: {
    paddingVertical: 4,
  },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  varLabel: { flex: 1, fontSize: 14, color: '#555' },
  varValue: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginRight: 10, minWidth: 60, textAlign: 'right' },

  footnote: {
    fontSize: 11, color: '#CCC', textAlign: 'center',
    lineHeight: 16, marginTop: 8,
  },
});
