import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { AssignmentCard } from '../../components/AssignmentCard';
import { SectionHeader } from '../../components/SectionHeader';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchDriverAssignments } from '../../lib/api';
import type { DriverAssignmentCard } from '../../lib/assignments';
import { isJobInProgress, toDriverAssignmentCard } from '../../lib/assignments';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function jobsSubtitle(count: number) {
  if (count === 0) return "Nothing assigned to you right now.";
  if (count === 1) return '1 job assigned to you today.';
  return `${count} jobs assigned to you today.`;
}

export default function AssignmentsScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignments, setAssignments] = useState<DriverAssignmentCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    try {
      const rows = await fetchDriverAssignments(token);
      setAssignments(rows.map(toDriverAssignmentCard));
      setError(null);
    } catch (err) {
      setAssignments([]);
      setError(err instanceof Error ? err.message : 'Failed to load assignments.');
    }
  };

  useEffect(() => {
    let mounted = true;
    const initialLoad = async () => {
      setLoading(true);
      await load();
      if (mounted) {
        setLoading(false);
      }
    };

    initialLoad();
    return () => {
      mounted = false;
    };
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Split into two groups so a driver juggling a couple of jobs can see at a
  // glance what's actually in their hands right now versus what's still
  // waiting — a single undifferentiated list forced them to read every
  // status badge to figure that out themselves.
  const { inProgress, awaiting } = useMemo(
    () => ({
      inProgress: assignments.filter((a) => isJobInProgress(a.status)),
      awaiting: assignments.filter((a) => !isJobInProgress(a.status)),
    }),
    [assignments]
  );

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader eyebrow="Dispatch board" title="Jobs" subtitle={jobsSubtitle(assignments.length)} />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>Loading your jobs…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={22} color={theme.colors.danger} />
          <Text style={styles.errorTitle}>Couldn't load your jobs</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} activeOpacity={0.85} onPress={load}>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.paper} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : assignments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={28} color={theme.colors.muted} />
          <Text style={styles.emptyTitle}>Nothing on your plate</Text>
          <Text style={styles.emptyText}>Pull down to refresh, or wait for dispatch to send your next job.</Text>
        </View>
      ) : (
        <>
          {inProgress.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>In progress</Text>
              <View style={styles.groupList}>
                {inProgress.map((item) => (
                  <AssignmentCard key={item.id} {...item} onPress={() => router.push(`/(app)/trip/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : null}

          {awaiting.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Awaiting pickup</Text>
              <View style={styles.groupList}>
                {awaiting.map((item) => (
                  <AssignmentCard key={item.id} {...item} onPress={() => router.push(`/(app)/trip/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  loaderText: { color: theme.colors.muted, fontSize: 13 },
  errorCard: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(193,68,46,0.35)',
    backgroundColor: 'rgba(193,68,46,0.08)',
  },
  errorTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  errorText: { color: theme.colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.danger,
  },
  retryText: { color: theme.colors.paper, fontSize: 12, fontWeight: '800' },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  emptyText: { color: theme.colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 240 },
  group: { marginBottom: 24 },
  groupLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    fontFamily: mono,
  },
  groupList: { gap: 12 },
});
