import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ConsistencyResult } from '../services/consistencyCheck';

interface Props {
  result: ConsistencyResult;
}

const CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  consistent: { bg: '#EAF7EE', text: '#1E8449', icon: '↑ trend' },
  counter:    { bg: '#FEF9E7', text: '#B7770D', icon: '↕ trend' },
  uncertain:  { bg: '#F2F3F4', text: '#717D7E', icon: '? trend' },
};

export default function ConsistencyChip({ result }: Props) {
  if (result.status === 'neutral' || !result.message) return null;

  const { bg, text, icon } = CONFIG[result.status];

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.icon, { color: text }]}>{icon}</Text>
      <Text style={[styles.message, { color: text }]}>{result.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
    marginBottom: 2,
    gap: 5,
  },
  icon: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  message: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
});
