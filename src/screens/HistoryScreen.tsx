import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SessionRecord } from '../types';
import { formatDuration, formatFocusTime } from '../util';
import { SwipeBackView } from '../components/SwipeBackView';

interface Props {
  todayFocusSeconds: number;
  weekFocusSeconds: number;
  sessions: SessionRecord[];
  onBack: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function HistoryScreen({ todayFocusSeconds, weekFocusSeconds, sessions, onBack }: Props) {
  return (
    <SwipeBackView onBack={onBack}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onBack} hitSlop={12}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>History</Text>

      <View style={styles.totals}>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{formatFocusTime(todayFocusSeconds)}</Text>
          <Text style={styles.totalLabel}>Today</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{formatFocusTime(weekFocusSeconds)}</Text>
          <Text style={styles.totalLabel}>This week</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Recent sessions</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {sessions.length === 0 ? (
          <Text style={styles.empty}>No sessions yet. Start your first jail.</Text>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowDate}>{formatDate(s.startTime)}</Text>
                <Text style={styles.rowMeta}>
                  {s.plannedDurationMinutes} min • {formatDuration(s.completedDurationSeconds)}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowStatus, s.status === 'completed' && styles.rowCompleted]}>
                  {s.status}
                </Text>
                <Text style={styles.rowMeta}>
                  W{s.warningsCount} / J{s.jailbreakCount}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      </View>
    </SwipeBackView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 24,
  },
  totals: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  totalCard: {
    backgroundColor: '#16161f',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232332',
    alignItems: 'center',
    minWidth: 130,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  totalLabel: {
    fontSize: 13,
    color: '#8a8a9e',
    marginTop: 4,
  },
  sectionLabel: {
    color: '#8a8a9e',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  list: {
    width: '100%',
    maxWidth: 360,
  },
  listContent: {
    paddingBottom: 20,
  },
  empty: {
    color: '#6a6a7a',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#101018',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e1e2c',
  },
  rowLeft: {},
  rowRight: {
    alignItems: 'flex-end',
  },
  rowDate: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  rowMeta: {
    color: '#6a6a7a',
    fontSize: 13,
    marginTop: 2,
  },
  rowStatus: {
    color: '#ffb84d',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  rowCompleted: {
    color: '#34d399',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
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
