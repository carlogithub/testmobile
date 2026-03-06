import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayForecast, LocationInfo, Scenario } from '../types';
import { getCurrentLocation } from '../services/locationService';
import { fetchForecast, weatherCodeToDisplay } from '../services/weatherApi';
import { getDeltaForLocation, getBothDeltas } from '../services/climateDelta';
import DayForecastRow from '../components/DayForecastRow';
import ScenarioToggle from '../components/ScenarioToggle';
import TempChart from '../components/TempChart';

type Status = 'idle' | 'loading' | 'error' | 'ready';
type ViewMode = 'list' | 'chart';

export default function HomeScreen() {
  const [status, setStatus]     = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [scenario, setScenario] = useState<Scenario>('ssp245');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus('loading');
      setErrorMsg('');
      const loc  = await getCurrentLocation();
      const days = await fetchForecast(loc.latitude, loc.longitude);
      setLocation(loc);
      setForecast(days);
      setStatus('ready');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Apply climate delta to a forecast day
  const applyDelta = (day: DayForecast, delta: number): DayForecast => ({
    ...day,
    maxTemp: Math.round(day.maxTemp + delta),
    minTemp: Math.round(day.minTemp + delta),
  });

  const delta = location
    ? getDeltaForLocation(location.latitude, location.longitude, scenario)
    : 0;

  const bothDeltas = location
    ? getBothDeltas(location.latitude, location.longitude)
    : { ssp245: 0, ssp585: 0 };

  const today    = forecast[0];
  const restDays = forecast.slice(1);
  const { emoji: todayEmoji, description: todayDesc } =
    today ? weatherCodeToDisplay(today.weatherCode) : { emoji: '🌡️', description: '' };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (status === 'idle' || status === 'loading') {
    return (
      <View style={styles.centred}>
        <Text style={styles.loadingEmoji}>🌍</Text>
        <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Locating you…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centred}>
        <Text style={styles.loadingEmoji}>😶‍🌫️</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor="#FF6B35" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.locationName}>{location?.cityName}</Text>
              <Text style={styles.locationCountry}>{location?.countryName}</Text>
            </View>
            <TouchableOpacity
              style={styles.viewToggleBtn}
              onPress={() => setViewMode(v => v === 'list' ? 'chart' : 'list')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewToggleText}>
                {viewMode === 'list' ? '📈 Chart' : '☰ List'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero — side-by-side today vs 2050 */}
        {today && (
          <View style={styles.heroRow}>
            {/* Today card */}
            <View style={[styles.heroCard, styles.todayCard]}>
              <Text style={styles.heroLabel}>Today</Text>
              <Text style={styles.heroEmoji}>{todayEmoji}</Text>
              <Text style={styles.heroTemp}>{today.maxTemp}°</Text>
              <Text style={styles.heroLow}>Low {today.minTemp}°</Text>
              <Text style={styles.heroDesc}>{todayDesc}</Text>
            </View>

            {/* 2050 card */}
            <View style={[styles.heroCard, styles.futureCard]}>
              <Text style={[styles.heroLabel, styles.futureLabelText]}>
                2050 ✦
              </Text>
              <Text style={styles.heroEmoji}>{todayEmoji}</Text>
              <Text style={[styles.heroTemp, styles.futureTemp]}>
                {applyDelta(today, delta).maxTemp}°
              </Text>
              <Text style={[styles.heroLow, styles.futureLow]}>
                Low {applyDelta(today, delta).minTemp}°
              </Text>
              <View style={styles.deltaChip}>
                <Text style={styles.deltaChipText}>
                  {delta >= 0 ? `+${delta.toFixed(1)}° warmer` : `${delta.toFixed(1)}° cooler`}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Scenario toggle */}
        <ScenarioToggle scenario={scenario} onChange={setScenario} />

        {/* 7-day forecast — list or chart */}
        {forecast.length > 0 && (
          <View style={styles.forecastCard}>
            <Text style={styles.forecastTitle}>7-day forecast</Text>
            {viewMode === 'chart' ? (
              <TempChart
                forecast={forecast}
                delta245={bothDeltas.ssp245}
                delta585={bothDeltas.ssp585}
              />
            ) : (
              forecast.map((day, i) => (
                <DayForecastRow
                  key={day.date}
                  today={day}
                  future={applyDelta(day, delta)}
                  delta={delta}
                  isFirst={i === 0}
                />
              ))
            )}
          </View>
        )}

        {/* Footer note */}
        <Text style={styles.footnote}>
          2050 temperatures use CMIP6 multimodel mean warming signal
          ({scenario === 'ssp245' ? 'SSP2-4.5 moderate emissions' : 'SSP5-8.5 high emissions'})
          added to today's ECMWF forecast.
          {'\n'}Reference: 2010–2024 → 2045–2055.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ORANGE = '#FF6B35';
const DARK_ORANGE = '#D44000';
const CREAM  = '#FFF8F5';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
  },

  // Loading / error
  centred: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F7F7F7',
  },
  loadingEmoji: { fontSize: 64 },
  loadingText:  { marginTop: 12, color: '#888', fontSize: 15 },
  errorText:    { marginTop: 12, color: '#555', fontSize: 15, textAlign: 'center',
                  paddingHorizontal: 32 },
  retryBtn: {
    marginTop: 20, backgroundColor: ORANGE,
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Header
  header: {
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  locationName: {
    fontSize: 28, fontWeight: '800', color: '#1A1A1A',
  },
  locationCountry: {
    fontSize: 14, color: '#888', marginTop: 2,
  },
  viewToggleBtn: {
    backgroundColor: '#F0F0F0', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  viewToggleText: {
    fontSize: 13, fontWeight: '600', color: '#555',
  },

  // Hero cards
  heroRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    gap: 10,
  },
  heroCard: {
    flex: 1, borderRadius: 20, padding: 18, alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000', shadowOpacity: 0.08,
        shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
    }),
  },
  todayCard: {
    backgroundColor: '#fff',
  },
  futureCard: {
    backgroundColor: CREAM,
    borderWidth: 1.5,
    borderColor: ORANGE,
  },
  heroLabel: {
    fontSize: 12, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  futureLabelText: { color: ORANGE },
  heroEmoji: { fontSize: 44, marginBottom: 6 },
  heroTemp: { fontSize: 52, fontWeight: '800', color: '#1A1A1A', lineHeight: 56 },
  futureTemp: { color: DARK_ORANGE },
  heroLow: { fontSize: 14, color: '#999', marginTop: 2 },
  futureLow: { color: '#C87050' },
  heroDesc: { fontSize: 12, color: '#AAA', marginTop: 6 },
  deltaChip: {
    marginTop: 8, backgroundColor: ORANGE,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  deltaChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Forecast list
  forecastCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 4,
    borderRadius: 20, overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000', shadowOpacity: 0.06,
        shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
    }),
  },
  forecastTitle: {
    fontSize: 13, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },

  // Footnote
  footnote: {
    marginHorizontal: 24, marginTop: 20,
    fontSize: 11, color: '#BBB', lineHeight: 16, textAlign: 'center',
  },
});
