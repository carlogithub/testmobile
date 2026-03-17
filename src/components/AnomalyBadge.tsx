import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnomalyResult } from '../types';

interface Props {
  anomaly: AnomalyResult | null;
}

function badgeStyle(pct: number): { bg: string; text: string } {
  if (pct >= 90) return { bg: '#c0392b', text: '#fff' };
  if (pct >= 75) return { bg: '#e67e22', text: '#fff' };
  if (pct >= 25) return { bg: '#27ae60', text: '#fff' };
  if (pct >= 10) return { bg: '#2980b9', text: '#fff' };
  return              { bg: '#1a5276', text: '#fff' };
}

export default function AnomalyBadge({ anomaly }: Props) {
  if (!anomaly) {
    return (
      <View style={[styles.badge, { backgroundColor: '#E0E0E0' }]}>
        <Text style={[styles.label, { color: '#999' }]}>—</Text>
      </View>
    );
  }

  const { bg, text } = badgeStyle(anomaly.percentile);
  const rpStr = anomaly.returnPeriod >= 20
    ? ` · 1-in-${Math.round(anomaly.returnPeriod)}yr`
    : '';

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>
        {anomaly.label}{rpStr}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-end',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
