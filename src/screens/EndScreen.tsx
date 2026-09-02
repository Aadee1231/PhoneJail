import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { SessionRecord, SessionStats } from '../types';
import { formatDuration, formatTime } from '../util';

interface Props {
  status: SessionRecord['status'];
  stats: SessionStats;
  onDone: () => void;
  onHistory: () => void;
}

export function EndScreen({ status, stats, onDone, onHistory }: Props) {
  const isFailed = status === 'failed';
  const isEarly = status === 'ended-early';
  const isCompleted = status === 'completed';

  const title = isFailed ? 'SENTENCE FAILED' : isEarly ? 'Session Ended' : 'SENTENCE SERVED';
  const subtitle = isFailed
    ? 'Too many jailbreaks. The jail could not hold you.'
    : isEarly
      ? 'You left early. Your progress is still saved.'
      : `You stayed focused for ${formatTime(stats.elapsedFocusSeconds)}.`;

  return (
    <View style={styles.container}>
      <VirtualJail mode={isFailed ? 'failed' : 'completed'} size={180} />

      <Text style={[styles.title, isFailed && styles.failedTitle]}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{stats.durationMinutes}</Text>
          <Text style={styles.summaryLabel}>planned (min)</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatDuration(stats.elapsedFocusSeconds)}</Text>
          <Text style={styles.summaryLabel}>focused</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{stats.warningsCount}</Text>
          <Text style={styles.summaryLabel}>warnings</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{stats.jailbreakCount}</Text>
          <Text style={styles.summaryLabel}>strikes</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, isCompleted && styles.statusDotSuccess, isFailed && styles.statusDotFailed]} />
        <Text style={styles.statusText}>
          {isCompleted ? 'Completed successfully' : isFailed ? 'Failed' : 'Ended early'}
        </Text>
      </View>

      <Pressable style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneButtonText}>Done</Text>
      </Pressable>

      <Pressable style={styles.link} onPress={onHistory}>
        <Text style={styles.linkText}>View History</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  failedTitle: {
    color: '#ff5252',
  },
  subtitle: {
    fontSize: 16,
    color: '#9a9aaf',
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  summary: {
    flexDirection: 'row',
    backgroundColor: '#16161f',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#232332',
    width: '100%',
    maxWidth: 340,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#2a2a3a',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8a8a9e',
    marginTop: 4,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffb84d',
    marginRight: 8,
  },
  statusDotSuccess: {
    backgroundColor: '#34d399',
  },
  statusDotFailed: {
    backgroundColor: '#ff5252',
  },
  statusText: {
    color: '#9a9aaf',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  doneButtonText: {
    color: '#0a0a12',
    fontSize: 17,
    fontWeight: '800',
  },
  link: {
    padding: 10,
  },
  linkText: {
    color: '#6a6a7a',
    fontSize: 15,
    fontWeight: '700',
  },
});
