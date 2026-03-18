/**
 * HomeScreen — the main screen of the Weather 2050 app.
 *
 * Layout (top to bottom):
 *   1. Header — city name + "Climate Context" button
 *   2. Hero cards — today's forecast side-by-side with the 2050 projection
 *   3. Temperature chart — 7-day bars with hot/cold day threshold lines
 *   4. Precipitation chart — 7-day bars with heavy-rain threshold line
 *   5. Footnote — data sources
 *
 * Climate projections use the SSP2-4.5 "middle road" emissions scenario
 * and CMIP6 / CORDEX-EUR delta data bundled inside the app (no network
 * call needed for the 2050 signal).
 *
 * The ERA5 historical thresholds (90th / 10th percentile lines) are
 * fetched in the background on first load and cached on the device.
 * The charts display immediately without them and add the lines once ready.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

import { DayForecast, DeltaResult, LocationInfo } from '../types';
import { getCurrentLocation }               from '../services/locationService';
import { fetchForecast, weatherCodeToDisplay } from '../services/weatherApi';
import { getDeltaForLocation, isInEuropeanDomain as isInEurope } from '../services/climateDelta';
import { getWeeklyThresholds, WeeklyThresholds } from '../services/climateContext';
import WeeklyThresholdChart from '../components/WeeklyThresholdChart';

type Status = 'idle' | 'loading' | 'error' | 'ready';
type Props  = NativeStackScreenProps<RootStackParamList, 'Home'>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }: Props) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [status,     setStatus]     = useState<Status>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [location,   setLocation]   = useState<LocationInfo | null>(null);
  const [forecast,   setForecast]   = useState<DayForecast[]>([]);
  const [thresholds, setThresholds] = useState<WeeklyThresholds | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data loading ───────────────────────────────────────────────────────────

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

  // Load forecast on mount
  useEffect(() => { load(); }, [load]);

  // Once we have location + forecast, kick off the ERA5 threshold fetch
  // in the background.  This may take ~30s on first use but the result
  // is cached on the device forever after (keyed to the 0.5° grid cell).
  useEffect(() => {
    if (!location || forecast.length === 0) return;
    const refDate = new Date(forecast[0].date + 'T12:00:00');
    getWeeklyThresholds(location.latitude, location.longitude, refDate)
      .then(setThresholds)
      .catch(() => {}); // fail silently — chart degrades gracefully without thresholds
  }, [location, forecast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Climate signal computation ─────────────────────────────────────────────
  //
  // For each of the 7 forecast days, look up the SSP2-4.5 warming delta
  // for that day's calendar month.  This gives a per-day temperature shift
  // and precipitation % change.

  const perDayDeltas: DeltaResult[] = forecast.map(day => {
    if (!location) return { tasDelta: 0, prDeltaPct: null };
    const month = new Date(day.date + 'T12:00:00').getMonth(); // 0=Jan … 11=Dec
    return getDeltaForLocation(location.latitude, location.longitude, 'ssp245', month);
  });

  // 2050 maximum temperature for each forecast day (used in the temp chart)
  const futureMaxTemps: number[] = forecast.map(
    (day, i) => day.maxTemp + perDayDeltas[i].tasDelta,
  );

  // 2050 precipitation for each day.
  // null = model agreement too low to show a signal (chart bar is hidden)
  const futurePrecips: (number | null)[] = forecast.map((day, i) => {
    const pct = perDayDeltas[i].prDeltaPct;
    return pct !== null ? day.precipMm * (1 + pct / 100) : null;
  });

  // Today's delta (used in the hero card)
  const todayDelta: DeltaResult = perDayDeltas[0] ?? { tasDelta: 0, prDeltaPct: null };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (status === 'idle' || status === 'loading') {
    return (
      <View style={styles.centred}>
        <Text style={styles.loadingEmoji}>🌍</Text>
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 16 }} />
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

  const today = forecast[0];
  const { emoji: todayEmoji, description: todayDesc } =
    today ? weatherCodeToDisplay(today.weatherCode) : { emoji: '🌡️', description: '' };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />
        }
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.locationName}>{location?.cityName}</Text>
            <Text style={styles.locationCountry}>{location?.countryName}</Text>
          </View>

          {/* Button to the Climate Context screen */}
          {location && forecast.length > 0 && (
            <TouchableOpacity
              style={styles.contextBtn}
              onPress={() => navigation.navigate('ClimateContext', { location, forecast })}
              activeOpacity={0.7}
            >
              <Text style={styles.contextBtnText}>🌡 How unusual is this week?</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Hero cards — today vs 2050 ───────────────────────────────────── */}
        {today && (
          <View style={styles.heroRow}>

            {/* Today */}
            <View style={[styles.heroCard, styles.todayCard]}>
              <Text style={styles.heroLabel}>Today</Text>
              <Text style={styles.heroEmoji}>{todayEmoji}</Text>
              <Text style={styles.heroTemp}>{today.maxTemp}°</Text>
              <Text style={styles.heroLow}>Low {today.minTemp}°</Text>
              <Text style={styles.heroDesc}>{todayDesc}</Text>
            </View>

            {/* 2050 SSP2-4.5 */}
            <View style={[styles.heroCard, styles.futureCard]}>
              <Text style={[styles.heroLabel, styles.futureLabelText]}>2050 ✦</Text>
              <Text style={styles.heroEmoji}>{todayEmoji}</Text>
              <Text style={[styles.heroTemp, styles.futureTemp]}>
                {Math.round(today.maxTemp + todayDelta.tasDelta)}°
              </Text>
              <Text style={[styles.heroLow, styles.futureLow]}>
                Low {Math.round(today.minTemp + todayDelta.tasDelta)}°
              </Text>

              {/* Temperature delta chip */}
              <View style={styles.deltaChip}>
                <Text style={styles.deltaChipText}>
                  {todayDelta.tasDelta >= 0
                    ? `+${todayDelta.tasDelta.toFixed(1)}° warmer`
                    : `${todayDelta.tasDelta.toFixed(1)}° cooler`}
                </Text>
              </View>

              {/* Precipitation change — hidden if model agreement is too low */}
              {todayDelta.prDeltaPct !== null && (
                <Text style={styles.heroPrecipNote}>
                  Precip {todayDelta.prDeltaPct >= 0
                    ? `+${todayDelta.prDeltaPct.toFixed(0)}%`
                    : `${todayDelta.prDeltaPct.toFixed(0)}%`}
                </Text>
              )}
            </View>

          </View>
        )}

        {/* ── Temperature threshold chart ──────────────────────────────────── */}
        {forecast.length > 0 && (
          <WeeklyThresholdChart
            forecast={forecast}
            todayValues={forecast.map(d => d.maxTemp)}
            futureValues={futureMaxTemps}
            thresholds={thresholds}
            unit="°C"
            title="Temperature this week"
            isPrecip={false}
          />
        )}

        {/* ── Precipitation threshold chart ────────────────────────────────── */}
        {forecast.length > 0 && (
          <WeeklyThresholdChart
            forecast={forecast}
            todayValues={forecast.map(d => d.precipMm)}
            futureValues={futurePrecips}
            thresholds={thresholds}
            unit="mm"
            title="Precipitation this week"
            isPrecip={true}
          />
        )}

        {/* ── Footnote ─────────────────────────────────────────────────────── */}
        <Text style={styles.footnote}>
          2050 projection uses{' '}
          {location && isInEurope(location.latitude, location.longitude)
            ? 'CORDEX-EUR (0.5°, RCP4.5)'
            : 'CMIP6 (2°, SSP2-4.5)'}{' '}
          warming signal applied to today's ECMWF forecast.{'\n'}
          Baseline 2010–2024 → future 2045–2055.
          Precipitation hidden where model agreement &lt; 66%.{'\n'}
          ERA5 thresholds: 1979–2024 · Open-Meteo Historical API.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const ORANGE      = '#FF6B35';
const DARK_ORANGE = '#D44000';
const CREAM       = '#FFF8F5';

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#F7F7F7' },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Loading / error
  centred:      { flex: 1, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#F7F7F7' },
  loadingEmoji: { fontSize: 64 },
  loadingText:  { marginTop: 12, color: '#888', fontSize: 15 },
  errorText:    { marginTop: 12, color: '#555', fontSize: 15,
                  textAlign: 'center', paddingHorizontal: 32 },
  retryBtn:     { marginTop: 20, backgroundColor: ORANGE,
                  paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  retryText:    { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Header
  header: {
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  locationName:    { fontSize: 28, fontWeight: '800', color: '#1A1A1A' },
  locationCountry: { fontSize: 14, color: '#888', marginTop: 2 },

  // "How unusual is this week?" button — more descriptive than the old small pill
  contextBtn: {
    backgroundColor: '#FFF0EB',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, marginTop: 4, maxWidth: 160,
  },
  contextBtnText: {
    fontSize: 12, fontWeight: '600', color: ORANGE,
    textAlign: 'center', lineHeight: 16,
  },

  // Hero cards
  heroRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, gap: 10,
  },
  heroCard: {
    flex: 1, borderRadius: 20, padding: 18, alignItems: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.08,
                 shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  todayCard:       { backgroundColor: '#fff' },
  futureCard:      { backgroundColor: CREAM, borderWidth: 1.5, borderColor: ORANGE },
  heroLabel:       { fontSize: 12, fontWeight: '700', color: '#999',
                     textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  futureLabelText: { color: ORANGE },
  heroEmoji:       { fontSize: 44, marginBottom: 6 },
  heroTemp:        { fontSize: 52, fontWeight: '800', color: '#1A1A1A', lineHeight: 56 },
  futureTemp:      { color: DARK_ORANGE },
  heroLow:         { fontSize: 14, color: '#999', marginTop: 2 },
  futureLow:       { color: '#C87050' },
  heroDesc:        { fontSize: 12, color: '#AAA', marginTop: 6 },
  deltaChip:       { marginTop: 8, backgroundColor: ORANGE,
                     paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  deltaChipText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroPrecipNote:  { fontSize: 11, color: '#C87050', marginTop: 4 },

  // Footnote
  footnote: {
    marginHorizontal: 24, marginTop: 16,
    fontSize: 11, color: '#BBB', lineHeight: 16, textAlign: 'center',
  },
});
