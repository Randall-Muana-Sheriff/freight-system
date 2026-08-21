import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { ToastOverlay, type Toast } from '../../components/ToastOverlay';
import { captureException } from '../../lib/crashReporting';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchDriverAssignments, fetchMyCompletedDeliveries, fetchMyDocuments, fetchMyProfile, fetchMyVehicle, type CompletedDelivery, type MyVehicle } from '../../lib/api';
import { getTrackingDiagnostics, startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../../lib/locationTracking';
import { isJobInProgress, toDriverAssignmentCard, type DriverAssignmentCard } from '../../lib/assignments';

// Takes the shift state because one of these greetings is a claim about it,
// not a time of day. "Still on shift" was returned for any hour before 5am
// whether or not the driver was working, so a driver opening the app at 1am
// was greeted as though mid-shift while the chip beside it said Off shift
// and the button below offered to start one — three elements on the same
// screen, two of them right. A greeting that contradicts the state is worse
// than a plain one, and this is the first thing anyone sees.
// null means the shift state has not loaded yet, and is treated as off: an
// unresolved state should not be asserted as a fact either.
function getGreeting(onShift: boolean | null) {
  const hour = new Date().getHours();
  if (hour < 5) return onShift === true ? 'Still on shift' : 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

const QUICK_ACTIONS = [
  { key: 'issue', label: 'Report Issue', detail: 'Safety & breakdowns', icon: 'warning-outline' as const, color: theme.colors.danger, href: '/(app)/incidents' as const },
  { key: 'alerts', label: 'View Alerts', detail: 'Trip & safety updates', icon: 'notifications-outline' as const, color: theme.colors.accent, href: '/(app)/alerts' as const },
  { key: 'jobs', label: 'My Jobs', detail: 'Dispatch board', icon: 'briefcase-outline' as const, color: theme.colors.primary, href: '/(app)/assignments' as const },
  { key: 'log', label: 'Delivery Log', detail: 'Completed deliveries', icon: 'time-outline' as const, color: theme.colors.gold, href: '/(app)/profile' as const },
];

export default function DashboardScreen() {
  const { username, token } = useAuth();
  // `username` is a phone/PIN driver's real identity (a phone number) but
  // was never meant to be shown as a name — fetch the actual name dispatch
  // set up for this driver, same source as the Profile screen.
  const [fullName, setFullName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<DriverAssignmentCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDelivery[]>([]);
  // null = not checked yet. A driver can log in the moment their account is
  // approved, but dispatch separately withholds jobs until all 5 compliance
  // documents are approved — this is the "why do I have no jobs" answer,
  // surfaced before it becomes a support question.
  const [documentsVerified, setDocumentsVerified] = useState<boolean | null>(null);
  // undefined = still loading; null = confirmed there isn't one.
  const [vehicle, setVehicle] = useState<MyVehicle | null | undefined>(undefined);
  // null = not checked yet. Standing in for "on shift" — Start/End shift
  // directly toggles the same background telemetry task the rest of the
  // app already starts automatically at sign-in, rather than a separate
  // concept the backend has no notion of yet.
  const [onShift, setOnShift] = useState<boolean | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = async () => {
    if (!token) return;
    try {
      const profile = await fetchMyProfile(token);
      if (!mountedRef.current) return;
      setFullName(profile.fullName);
    } catch {
      // Leave the last-known name in place on failure (e.g. offline) rather
      // than wiping it — the fallback below would otherwise show the
      // driver's phone number in place of their name until connectivity
      // is restored and this refetches successfully.
    }
  };

  const loadAssignments = async () => {
    if (!token) return;
    try {
      const rows = await fetchDriverAssignments(token);
      if (!mountedRef.current) return;
      setAssignments(rows.map(toDriverAssignmentCard));
    } catch {
      // Leave the last-known assignments on screen on failure (e.g.
      // offline) instead of wiping them — an empty list here reads as
      // "you have no jobs," which isn't true, it's just that this
      // particular refresh didn't get through.
    }
  };

  const checkShift = async () => {
    try {
      const diagnostics = await getTrackingDiagnostics();
      if (!mountedRef.current) return;
      setOnShift(diagnostics.hasStarted);
    } catch {
      if (!mountedRef.current) return;
      setOnShift(false);
    }
  };

  const checkVerification = async () => {
    if (!token) return;
    try {
      const data = await fetchMyDocuments(token);
      if (!mountedRef.current) return;
      setDocumentsVerified(data.verified);
    } catch {
      // Leave the last-known verification state on failure — see
      // loadAssignments above for why a failed refresh shouldn't overwrite
      // already-known good data with a "not verified" sentinel.
    }
  };

  const checkVehicle = async () => {
    if (!token) return;
    try {
      const data = await fetchMyVehicle(token);
      if (!mountedRef.current) return;
      setVehicle(data);
    } catch {
      // Leave the last-known vehicle on failure — setting this to `null`
      // renders the "No vehicle assigned" warning below even for a driver
      // who has one, purely because this one refresh didn't get through.
    }
  };

  const loadDeliveries = async () => {
    if (!token) return;
    try {
      const rows = await fetchMyCompletedDeliveries(token);
      if (!mountedRef.current) return;
      setCompletedDeliveries(rows);
    } catch {
      // Leave the last-known delivery history on failure — see
      // loadAssignments above.
    }
  };

  useEffect(() => {
    loadProfile();
    loadAssignments();
    checkShift();
    checkVerification();
    checkVehicle();
    loadDeliveries();
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Promise.all rejects as soon as any one of these does, so a single
      // failing loader used to skip setRefreshing(false) entirely and leave
      // the pull-to-refresh spinner turning forever with no way back.
      await Promise.all([loadProfile(), loadAssignments(), checkShift(), checkVerification(), checkVehicle(), loadDeliveries()]);
    } catch (err) {
      captureException(err, { screen: 'home', action: 'refresh' });
      setToast({
        icon: 'cloud-offline-outline',
        tone: 'warning',
        message: 'Could not refresh everything. Pull down to try again.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const onToggleShift = async () => {
    setShiftBusy(true);
    try {
      if (onShift) {
        await stopBackgroundLocationTracking();
      } else {
        await startBackgroundLocationTracking();
      }
    } catch (err) {
      // There was a finally but no catch, and this is fired from onPress
      // without being awaited — so a failure to start tracking cleared the
      // spinner, left the driver off shift, and explained nothing. Starting a
      // shift is the one action the whole app hangs off: if it fails silently
      // the driver believes they are working and dispatch sees nobody.
      captureException(err, { screen: 'home', action: onShift ? 'end-shift' : 'start-shift' });
      setToast({
        icon: 'alert-circle-outline',
        tone: 'error',
        message: onShift
          ? 'Could not end your shift. Check your connection and try again.'
          : 'Could not start your shift — location may be off or permission denied.',
      });
    } finally {
      await checkShift();
      setShiftBusy(false);
    }
  };

  const { awaitingCount, inProgressCount } = useMemo(
    () => ({
      awaitingCount: assignments.filter((a) => !isJobInProgress(a.status)).length,
      inProgressCount: assignments.filter((a) => isJobInProgress(a.status)).length,
    }),
    [assignments]
  );

  const doneTodayCount = completedDeliveries.filter((d) => isToday(d.confirmed_at)).length;
  const doneThisWeekCount = completedDeliveries.filter((d) => {
    if (!d.confirmed_at) return false;
    return Date.now() - new Date(d.confirmed_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.greeting}>{getGreeting(onShift)}</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{fullName || username || 'Driver'}</Text>
          </View>
        </View>
        <View style={[styles.shiftChip, onShift ? styles.shiftChipOn : styles.shiftChipOff]}>
          <Text style={[styles.shiftChipText, { color: onShift ? theme.colors.primary : theme.colors.muted }]}>
            {onShift ? 'On shift' : 'Off shift'}
          </Text>
        </View>
      </View>

      {documentsVerified === false ? (
        <TouchableOpacity onPress={() => router.push('/(app)/documents')} activeOpacity={0.7} style={styles.notice}>
          <View style={[styles.noticeRail, { backgroundColor: theme.colors.warning }]} />
          <Ionicons name="alert-circle-outline" size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Verification required</Text>
            <Text style={styles.noticeDetail}>Submit your documents to start receiving assignments.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      ) : null}

      {vehicle === null ? (
        <TouchableOpacity onPress={() => router.push('/(app)/profile')} activeOpacity={0.7} style={styles.notice}>
          <View style={[styles.noticeRail, { backgroundColor: theme.colors.warning }]} />
          <Ionicons name="car-outline" size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>No vehicle assigned</Text>
            <Text style={styles.noticeDetail}>Dispatch cannot send you jobs until a vehicle is assigned to you.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      ) : null}

      <View style={[styles.shiftCard, onShift ? styles.shiftCardOn : null]}>
        <Text style={styles.shiftEyebrow}>Dispatch board</Text>
        <Text style={styles.shiftTitle}>
          {assignments.length === 0 ? 'No jobs assigned' : `${assignments.length} job${assignments.length === 1 ? '' : 's'} on your board`}
        </Text>
        <Text style={styles.shiftSubtitle}>
          {onShift ? 'Dispatch can assign you jobs while your shift is active.' : 'Start your shift so dispatch can assign the next manifest.'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Awaiting</Text>
            <Text style={styles.statValue}>{awaitingCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>In progress</Text>
            <Text style={styles.statValue}>{inProgressCount}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Done today</Text>
            <Text style={styles.statValue}>{doneTodayCount}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.shiftButton, onShift ? styles.shiftButtonEnd : styles.shiftButtonStart]}
          activeOpacity={0.9}
          onPress={onToggleShift}
          disabled={shiftBusy || onShift === null}
          accessibilityRole="button"
          accessibilityLabel={onShift ? 'End shift' : 'Start shift'}
          accessibilityHint={
            onShift
              ? 'Stops sharing your location with dispatch'
              : 'Starts sharing your location so dispatch can assign you jobs'
          }
          accessibilityState={{ disabled: shiftBusy || onShift === null, busy: shiftBusy }}
        >
          <Ionicons name={onShift ? 'stop-circle-outline' : 'play-circle-outline'} size={17} color={theme.colors.ink} />
          <Text style={styles.shiftButtonText}>{onShift ? 'End shift' : 'Start shift'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.quickLabel}>Quick actions</Text>
      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.quickTile}
            activeOpacity={0.8}
            onPress={() => router.push(action.href)}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}. ${action.detail}`}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: `${action.color}1F` }]}>
              <Ionicons name={action.icon} size={18} color={action.color} />
            </View>
            <Text style={styles.quickLabelText}>{action.label}</Text>
            <Text style={styles.quickDetailText} numberOfLines={1}>
              {action.key === 'log' ? `${doneThisWeekCount} this week` : action.detail}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ToastOverlay toast={toast} onHide={() => setToast(null)} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 24, marginTop: 4 },
  headerTextWrap: { flex: 1 },
  greeting: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.bodyMedium },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  name: { color: theme.colors.text, ...theme.type.display, fontFamily: theme.fonts.headingBlack, letterSpacing: -0.4, flexShrink: 1 },
  shiftChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, marginTop: 4 },
  shiftChipOn: { backgroundColor: `${theme.colors.primary}1A`, borderColor: `${theme.colors.primary}55` },
  shiftChipOff: { backgroundColor: theme.colors.panelSoft, borderColor: theme.colors.border },
  shiftChipText: { ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  noticeRail: { width: 3, height: 28, borderRadius: 2 },
  noticeTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  noticeDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.body },
  shiftCard: {
    // surface3: the primary card of the Home tab — starting and ending a
    // shift is the action the whole screen exists for.
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: 20,
    marginBottom: 24,
  },
  shiftCardOn: { borderColor: theme.colors.primary },
  shiftEyebrow: {
    color: theme.colors.muted,
    ...theme.type.micro,
    fontFamily: theme.fonts.mono,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  shiftTitle: { color: theme.colors.text, ...theme.type.title, fontFamily: theme.fonts.headingBlack, marginTop: 8, letterSpacing: -0.3 },
  shiftSubtitle: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 6, fontFamily: theme.fonts.body },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 20 },
  statCell: { flex: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: theme.colors.border, marginHorizontal: 12 },
  statLabel: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { color: theme.colors.text, ...theme.type.title, fontFamily: theme.fonts.headingBlack, marginTop: 4, fontVariant: ['tabular-nums'] },
  shiftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
  },
  shiftButtonStart: { backgroundColor: theme.colors.primary },
  shiftButtonEnd: { backgroundColor: theme.colors.danger },
  shiftButtonText: { color: theme.colors.ink, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  quickLabel: {
    color: theme.colors.muted,
    ...theme.type.micro,
    fontFamily: theme.fonts.mono,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickTile: {
    width: '47%',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  quickIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickLabelText: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  quickDetailText: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.body },
});
