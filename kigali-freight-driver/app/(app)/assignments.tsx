import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { AssignmentCard } from '../../components/AssignmentCard';
import { RunCard } from '../../components/RunCard';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchDriverAssignments, fetchMyTrip, isNetworkFailure, type Trip } from '../../lib/api';
import { isJobInProgress, toDriverAssignmentCard, type DriverAssignmentCard } from '../../lib/assignments';

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
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      // Both in parallel: a driver on a run still has ordinary jobs, and
      // waiting on one to show the other doubles the wait on a bad signal.
      const [rows, run] = await Promise.all([
        fetchDriverAssignments(token),
        // A run is an addition to this screen, not a precondition for it —
        // if only this call fails the job list must still render.
        fetchMyTrip(token).catch(() => null),
      ]);
      setAssignments(rows.map(toDriverAssignmentCard));
      setTrip(run);
      setError(null);
    } catch (err) {
      setAssignments([]);
      // isNetworkFailure first — a dropped connection surfaces here as
      // React Native's raw fetch exception (e.g. "fetch failed:
      // java.net.ConnectException: Failed to connect to /192.168.1.71:5000"),
      // which reads like a stack trace to a driver, not a signal to check
      // their signal. Every other screen in this app (trip detail,
      // incidents) already translates that case; this one just hadn't.
      setError(
        isNetworkFailure(err)
          ? "Can't reach dispatch right now. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : 'Failed to load assignments.'
      );
    }
  }, [token]);

  // useFocusEffect (not a plain mount-only effect) so a job dispatched
  // while the driver had this tab open earlier — or any status change from
  // another screen — shows up the moment they switch back to Jobs, not
  // only after a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const runLoad = async () => {
        setLoading(true);
        await load();
        if (mounted) {
          setLoading(false);
        }
      };

      runLoad();
      return () => {
        mounted = false;
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      // finally, not a bare sequence: if load() ever rejects the spinner
      // would otherwise turn indefinitely. load() reports its own failures
      // through setError, so there is nothing to add here beyond stopping.
      setRefreshing(false);
    }
  };

  // Split into two groups so a driver juggling a couple of jobs can see at a
  // glance what's actually in their hands right now versus what's still
  // waiting — a single undifferentiated list forced them to read every
  // status badge to figure that out themselves.
  const { offers, inProgress, awaiting } = useMemo(
    () => ({
      // Offers first and separate. Work a driver has not agreed to is a
      // decision waiting on them, not a job on their plate, and burying it
      // under "awaiting pickup" is how an offer quietly expires.
      offers: assignments.filter((a) => a.isOffer),
      inProgress: assignments.filter((a) => !a.isOffer && isJobInProgress(a.status)),
      awaiting: assignments.filter((a) => !a.isOffer && !isJobInProgress(a.status)),
    }),
    [assignments]
  );

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader eyebrow="Dispatch board" title="Jobs" subtitle={jobsSubtitle(assignments.length)} />

      {/* Above everything, and outside the loading/error/empty branches
          below: a driver on a run needs the next stop first, and the run
          having loaded does not depend on the job list having loaded.
          Completed runs are not shown — the work is finished, and leaving
          a green run card on screen reads as something still to do. */}
      {trip && trip.status !== 'COMPLETED' && trip.stopCount > 0 ? (
        <RunCard trip={trip} token={token ?? ''} onChanged={setTrip} />
      ) : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>Loading your jobs…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={22} color={theme.colors.danger} />
          <Text style={styles.errorTitle}>Couldn&apos;t load your jobs</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} activeOpacity={0.85} onPress={load}>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.paper} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : assignments.length === 0 ? (
        trip && trip.status !== 'COMPLETED' ? null : (
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="Nothing on your plate"
            body="Pull down to refresh, or wait for dispatch to send your next job."
          />
        )
      ) : (
        <>
          {offers.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Offered to you</Text>
              <View>
                {offers.map((item) => (
                  <AssignmentCard key={item.id} {...item} onPress={() => router.push(`/(app)/trip/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : null}

          {inProgress.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>In progress</Text>
              <View>
                {inProgress.map((item) => (
                  <AssignmentCard key={item.id} {...item} onPress={() => router.push(`/(app)/trip/${item.id}`)} />
                ))}
              </View>
            </View>
          ) : null}

          {awaiting.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Awaiting pickup</Text>
              <View>
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
  loaderText: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  errorState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  errorTitle: { color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold, marginTop: 2 },
  errorText: { color: theme.colors.muted, ...theme.type.bodySm, textAlign: 'center', fontFamily: theme.fonts.body },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.danger,
  },
  retryText: { color: theme.colors.ink, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  group: { marginBottom: 28 },
  groupLabel: {
    color: theme.colors.muted,
    ...theme.type.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: theme.fonts.mono,
  },
});
