import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HomeStats } from '../types';
import { formatFocusTime, parseCustom } from '../util';

const DURATIONS = [15, 30, 45, 60];

function customInputWidth(text: string) {
  return Math.max(40, text.length * 14 + 22);
}

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
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isCustom) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isCustom]);

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
      <View style={styles.topSection}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>PhoneJail</Text>
        </View>

        <Text style={styles.headlineMain}>Put your phone down.</Text>
        <Text style={styles.headlineSub}>Get your life back.</Text>

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
      </View>

      <View style={styles.middleSection}>
        <Text style={styles.sectionLabel}>Session length</Text>

        <View style={styles.chipsRow}>
          {DURATIONS.map((d) => {
            const selected = !isCustom && durationMinutes === d;
            return (
              <Pressable
                key={d}
                onPress={() => onSelect(d)}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {d} min
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setIsCustom(true)}
          style={({ pressed }) => [
            styles.customChip,
            isCustom && styles.customChipSelected,
            pressed && styles.customChipPressed,
          ]}
        >
          {isCustom ? (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.customInput, { width: customInputWidth(customMinutes) }]}
                value={customMinutes}
                onChangeText={onCustomChange}
                onFocus={onCustomFocus}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="45"
                placeholderTextColor="rgba(255,255,255,0.35)"
                textAlign="center"
              />
              <Text style={styles.customUnit}>min</Text>
            </>
          ) : (
            <Text style={[styles.chipText, isCustom && styles.chipTextSelected]}>Custom</Text>
          )}
        </Pressable>

        <Pressable
          onPress={onEnter}
          style={({ pressed }) => [styles.enterButton, pressed && styles.enterButtonPressed]}
        >
          <Text style={styles.enterButtonText}>Enter Jail</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onHistory} style={({ pressed }) => [styles.footerLink, pressed && styles.footerLinkPressed]}>
          <Text style={styles.footerLinkText}>History</Text>
        </Pressable>
        <View style={styles.footerDot} />
        <Pressable onPress={onSettings} style={({ pressed }) => [styles.footerLink, pressed && styles.footerLinkPressed]}>
          <Text style={styles.footerLinkText}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E9DFF',
    marginRight: 10,
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  brand: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8A9CB0',
    letterSpacing: 0.5,
  },
  headlineMain: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 40,
  },
  headlineSub: {
    fontSize: 34,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 28,
  },
  statsCard: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(46,157,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,157,255,0.12)',
    paddingVertical: 20,
    paddingHorizontal: 12,
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.08,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '60%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  middleSection: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 380,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(46,157,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(46,157,255,0.14)',
  },
  chipSelected: {
    backgroundColor: '#2E9DFF',
    borderColor: '#2E9DFF',
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(46,157,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(46,157,255,0.14)',
    marginBottom: 16,
  },
  customChipSelected: {
    backgroundColor: 'rgba(46,157,255,0.12)',
    borderColor: '#2E9DFF',
  },
  customChipPressed: {
    opacity: 0.85,
  },
  customInput: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    paddingVertical: 0,
  },
  customUnit: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 4,
  },
  enterButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: '#2E9DFF',
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  enterButtonPressed: {
    opacity: 0.85,
  },
  enterButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    width: '100%',
  },
  footerLink: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerLinkPressed: {
    opacity: 0.6,
  },
  footerLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
