import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Scenario } from '../types';

interface Props {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}

const LABELS: Record<Scenario, string> = {
  ssp245: 'Middle road',
  ssp585: 'High emissions',
};

export default function ScenarioToggle({ scenario, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>2050 scenario</Text>
      <View style={styles.toggle}>
        {(['ssp245', 'ssp585'] as Scenario[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.option, scenario === s && styles.active]}
            onPress={() => onChange(s)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, scenario === s && styles.activeText]}>
              {LABELS[s]}
            </Text>
            <Text style={[styles.optionSub, scenario === s && styles.activeText]}>
              {s === 'ssp245' ? 'SSP2-4.5' : 'SSP5-8.5'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#EFEFEF',
    borderRadius: 12,
    padding: 3,
  },
  option: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  active: {
    backgroundColor: '#FF6B35',
    shadowColor: '#FF6B35',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  optionSub: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  activeText: {
    color: '#fff',
  },
});
