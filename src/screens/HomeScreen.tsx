import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { HomeStats } from '../types';
import { formatFocusTime } from '../util';
import { parseCustom } from '../util';

const DURATIONS = [15, 30, 45, 60];

interface Props {
  durationMinutes: number;
  setDurationMinutes: (d: number) => void;
  onEnterJail: (minutes: number) => void;
  homeStats: HomeStats;
  onHistory: () => void;
  onSettings: () => void;
}

export function HomeScreen({
  durationMinutes,
  setDurationMinutes,
  onEnterJail,
  homeStats,
  onHistory,
  onSettings,
}: Props) {
  const [isCustom, setIsCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(durationMinutes));

  const onSelect = (d: number) => {
    setIsCustom(false);
    setDurationMinutes(d);
    setCustomMinutes(String(d));
  };

  const onCustomFocus = () => {
    setIsCustom(true);
    const parsed = parseCustom(customMinutes);
    if (parsed) setDurationMinutes(parsed);
  };

  const onCustomChange = (text: string) => {
    setCustomMinutes(text);
    const parsed = parseCustom(text);
    if (parsed) setDurationMinutes(parsed);
  };

  const onEnter = () => {
    const chosen = isCustom ? parseCustom(customMinutes) : durationMinutes;
    if (chosen && chosen > 0) {
      if (isCustom) setDurationMinutes(chosen);
      onEnterJail(chosen);
    }
  };

  return (
    <View style={styles.container}>
      <VirtualJail mode="idle" size={150} />

      <View style={styles.brandRow}>
        <View style={styles.brandDot} />
        <Text style={styles.brand}>PHONEJAIL</Text>
      </View>

      <Text style={styles.taglineMain}>Put your phone down.</Text>
      <Text style={styles.taglineSub}>Get your life back.</Text>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatFocusTime(homeStats.todayFocusSeconds)}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{homeStats.currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{homeStats.sessionsCompletedThisWeek}</Text>
          <Text style={styles.statLabel}>This week</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Sentence length</Text>
      <View style={styles.row}>
        {DURATIONS.map((d) => (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[
              styles.chip,
              !isCustom && durationMinutes === d && styles.chipSelected,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                !isCustom && durationMinutes === d && styles.chipTextSelected,
              ]}
            >
              {d} min
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setIsCustom(true)}
        style={[styles.customChip, isCustom && styles.customChipSelected]}
      >
        <Text style={[styles.customLabel, isCustom && styles.customLabelActive]}>Custom</Text>
        <TextInput
          style={[styles.customInput, isCustom && styles.customInputActive]}
          value={customMinutes}
          onChangeText={onCustomChange}
          onFocus={onCustomFocus}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="45"
          placeholderTextColor="#5a5a6a"
        />
        <Text style={[styles.customUnit, isCustom && styles.customUnitActive]}>min</Text>
      </Pressable>

      <Pressable style={styles.enterButton} onPress={onEnter}>
        <Text style={styles.enterButtonText}>Enter Jail</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable style={styles.link} onPress={onHistory}>
          <Text style={styles.linkText}>History</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onSettings}>
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 14,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 9,
  },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7c8199',
    letterSpacing: 2.5,
  },
  taglineMain: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f5f6fa',
    textAlign: 'center',
    lineHeight: 38,
  },
  taglineSub: {
    fontSize: 32,
    fontWeight: '800',
    color: '#5a5f75',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 38,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    width: '100%',
    maxWidth: 340,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f5f6fa',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#7c8199',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionLabel: {
    color: '#7c8199',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  chipSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  chipText: {
    color: '#9a9fb5',
    fontSize: 15,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#fff',
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 32,
  },
  customChipSelected: {
    borderColor: '#3b82f6',
  },
  customLabel: {
    color: '#9a9fb5',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 10,
  },
  customLabelActive: {
    color: '#fff',
  },
  customInput: {
    width: 56,
    color: '#9a9fb5',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
  },
  customInputActive: {
    color: '#fff',
  },
  customUnit: {
    color: '#7c8199',
    fontSize: 15,
    fontWeight: '600',
  },
  customUnitActive: {
    color: '#fff',
  },
  enterButton: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#3b82f6',
    paddingVertical: 20,
    borderRadius: 18,
    alignItems: 'center',
  },
  enterButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 28,
  },
  link: {
    padding: 8,
  },
  linkText: {
    color: '#5a5f75',
    fontSize: 15,
    fontWeight: '700',
  },
});
