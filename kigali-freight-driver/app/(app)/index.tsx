import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { AssignmentCard } from '../../components/AssignmentCard';
import { SectionHeader } from '../../components/SectionHeader';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchDriverAssignments } from '../../lib/api';
import { getTrackingDiagnostics } from '../../lib/locationTracking';
import type { DriverAssignmentCard } from '../../lib/assignments';
import { isJobInProgress, toDriverAssignmentCard } from '../../lib/assignments';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still on shift';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

const CHIP_TONES = {
  primary: { bg: 'rgba(255,138,61,0.14)', text: theme.colors.primary },
  warning: { bg: 'rgba(224,162,56,0.16)', text: theme.colors.warning },
} as const;

function StatusChip({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone: keyof typeof CHIP_TONES }) {
  const palette = CHIP_TONES[tone];
  return (
    <View style={[chipStyles.chip, { backgroundColor: palette.bg }]}>
      <Ionicons name={icon} size={13} color={palette.text} />
      <Text style={[chipStyles.text, { color: palette.text }]}>{text}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7 },
  text: { fontSize: 11, fontWeight: '700' },
});

export default function DashboardScreen() {
  const { username, token, pendingSyncCount } = useAuth();
  const [assignments, setAssignments] = useState<DriverAssignmentCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // null = not checked yet, so the chip stays silent rather than flashing
  // a wrong state for a frame.
  const [telemetryLive, setTelemetryLive] = useState<boolean | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAssignments = async () => {
    if (!token) return;
    try {
      const rows = await fetchDriverAssignments(token);
      if (!mountedRef.current) return;
      setAssignments(rows.map(toDriverAssignmentCard));
    } catch {
      if (!mountedRef.current) return;
      setAssignments([]);
    }
  };

  // Previously this chip just said "Telemetry live" unconditionally — true
  // or not. Read the same diagnostic the Profile screen uses so the badge
  // reflects whether the background task is actually registered.
  const checkTelemetry = async () => {
    try {
      const diagnostics = await getTrackingDiagnostics();
      if (!mountedRef.current) return;
      setTelemetryLive(diagnostics.hasStarted);
    } catch {
      if (!mountedRef.current) return;
      setTelemetryLive(false);
    }
  };

  useEffect(() => {
    loadAssignments();
    checkTelemetry();
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAssignments(), checkTelemetry()]);
    setRefreshing(false);
  };

  const { activeJob, isActiveJobInProgress, remainingAssignments, awaitingCount, inProgressCount } = useMemo(() => {
    const inProgress = assignments.filter((a) => isJobInProgress(a.status));
    const awaiting = assignments.filter((a) => !isJobInProgress(a.status));
    const featured = inProgress[0] ?? awaiting[0] ?? null;
    return {
      activeJob: featured,
      isActiveJobInProgress: featured ? isJobInProgress(featured.status) : false,
      remainingAssignments: assignments.filter((a) => a.id !== featured?.id),
      awaitingCount: awaiting.length,
      inProgressCount: inProgress.length,
    };
  }, [assignments]);

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.name}>{username || 'Driver'}</Text>
        </View>
        <TouchableOpacity style={styles.avatarButton} activeOpacity={0.85} onPress={() => router.push('/(app)/profile')}>
          <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTopBar} />

        <View style={styles.heroChipRow}>
          {telemetryLive !== null ? (
            <StatusChip
              icon="radio-outline"
              text={telemetryLive ? 'Telemetry live' : 'Telemetry off'}
              tone={telemetryLive ? 'primary' : 'warning'}
            />
          ) : null}
          {pendingSyncCount > 0 ? <StatusChip icon="cloud-offline-outline" text={`${pendingSyncCount} queued`} tone="warning" /> : null}
        </View>

        {activeJob ? (
          <>
            <Text style={[styles.heroEyebrow, { color: isActiveJobInProgress ? theme.colors.primary : theme.colors.accent }]}>
              {isActiveJobInProgress ? 'Continue trip' : 'Next up'}
            </Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{activeJob.title}</Text>
            <View style={styles.heroMetaRow}>
              <Ionicons name="navigate-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.heroMeta} numberOfLines={1}>{activeJob.destination}</Text>
            </View>
            <TouchableOpacity
              style={styles.heroActionButton}
              activeOpacity={0.9}
              onPress={() => router.push(`/(app)/trip/${activeJob.id}`)}
            >
              <Text style={styles.heroActionText}>{isActiveJobInProgress ? 'Open trip' : 'Start pickup'}</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.paper} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.heroEyebrow, { color: theme.colors.muted }]}>All caught up</Text>
            <Text style={styles.heroTitle}>No jobs assigned yet</Text>
            <Text style={styles.heroMeta}>Dispatch will send your next manifest here as soon as it's ready.</Text>
          </>
        )}

        <View style={styles.heroDivider} />

        <View style={styles.heroFooterRow}>
          <View style={styles.heroMetricMini}>
            <Text style={styles.heroMetricLabel}>Awaiting pickup</Text>
            <Text style={styles.heroMetricValue}>{awaitingCount}</Text>
          </View>
          <View style={styles.heroMetricMini}>
            <Text style={styles.heroMetricLabel}>In progress</Text>
            <Text style={styles.heroMetricValue}>{inProgressCount}</Text>
          </View>
        </View>
      </View>

      {remainingAssignments.length > 0 ? (
        <>
          <SectionHeader eyebrow="Manifest" title="Up next" subtitle="The rest of today's manifest." />
          <View style={{ gap: 12 }}>
            {remainingAssignments.map((item) => (
              <AssignmentCard key={item.id} {...item} onPress={() => router.push(`/(app)/trip/${item.id}`)} />
            ))}
          </View>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 4 },
  greeting: { color: theme.colors.muted, fontSize: 13, fontWeight: '600' },
  name: { color: theme.colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.4, marginTop: 2 },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hero: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 18,
    marginBottom: 28,
    gap: 14,
    overflow: 'hidden',
  },
  heroTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: theme.colors.primary },
  heroChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', minHeight: 27 },
  heroEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: mono },
  heroTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4, lineHeight: 29 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroMeta: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, flex: 1 },
  heroActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    marginTop: 2,
  },
  heroActionText: { color: theme.colors.paper, fontSize: 13, fontWeight: '900' },
  heroDivider: { height: 1, backgroundColor: theme.colors.border },
  heroFooterRow: { flexDirection: 'row', gap: 10 },
  heroMetricMini: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heroMetricLabel: { color: theme.colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: mono },
  heroMetricValue: { color: theme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
});
