import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Settings, Sensitivity, WarningGrace } from '../types';

interface Props {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  onBack: () => void;
}

const SENSITIVITIES: { key: Sensitivity; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
];

const GRACES: { key: WarningGrace; label: string }[] = [
  { key: 500, label: '0.5s' },
  { key: 1000, label: '1.0s' },
  { key: 2000, label: '2.0s' },
];

export function SettingsScreen({ settings, updateSetting, onBack }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Motion Sensitivity</Text>
        <View style={styles.row}>
          {SENSITIVITIES.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => updateSetting('sensitivity', s.key)}
              style={[styles.chip, settings.sensitivity === s.key && styles.chipSelected]}
            >
              <Text
                style={[
                  styles.chipText,
                  settings.sensitivity === s.key && styles.chipTextSelected,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Higher sensitivity detects movement more easily.</Text>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Warning Grace Period</Text>
        <View style={styles.row}>
          {GRACES.map((g) => (
            <Pressable
              key={g.key}
              onPress={() => updateSetting('warningGraceMs', g.key)}
              style={[styles.chip, settings.warningGraceMs === g.key && styles.chipSelected]}
            >
              <Text
                style={[
                  styles.chipText,
                  settings.warningGraceMs === g.key && styles.chipTextSelected,
                ]}
              >
                {g.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Alarm sound</Text>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(v) => updateSetting('soundEnabled', v)}
            trackColor={{ false: '#3a3a4a', true: '#4a5af5' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Haptics</Text>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={(v) => updateSetting('hapticsEnabled', v)}
            trackColor={{ false: '#3a3a4a', true: '#4a5af5' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Text style={styles.toggleLabel}>Hard Mode</Text>
            <Text style={styles.hint}>A jailbreak immediately ends the session.</Text>
          </View>
          <Switch
            value={settings.hardMode}
            onValueChange={(v) => updateSetting('hardMode', v)}
            trackColor={{ false: '#3a3a4a', true: '#ff5252' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#16161f',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232332',
  },
  sectionLabel: {
    color: '#8a8a9e',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: '#232332',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: '#4a5af5',
    borderColor: '#4a5af5',
  },
  chipText: {
    color: '#b4b4c4',
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#fff',
  },
  hint: {
    color: '#6a6a7a',
    fontSize: 12,
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#232332',
  },
  toggleLeft: {
    flex: 1,
    paddingRight: 10,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a4a',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
