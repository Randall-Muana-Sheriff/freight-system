import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { ToastOverlay, type Toast } from '../../components/ToastOverlay';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { EmptyState } from '../../components/EmptyState';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchMyProfile, fetchMyVehicle, fetchMyCompletedDeliveries, fetchMyDocuments, type MyProfile, type MyVehicle, type CompletedDelivery } from '../../lib/api';
import { getTrackingDiagnostics, sendTestLocationPing } from '../../lib/locationTracking';

type Diagnostics = Awaited<ReturnType<typeof getTrackingDiagnostics>>;
type Tone = 'good' | 'bad' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  good: theme.colors.success,
  bad: theme.colors.danger,
  neutral: theme.colors.warning,
};

function humanizePermission(status?: string): { value: string; tone: Tone } {
  if (status === 'granted') return { value: 'Allowed', tone: 'good' };
  if (status === 'denied') return { value: 'Blocked', tone: 'bad' };
  return { value: 'Not asked yet', tone: 'neutral' };
}

function overallLocationStatus(diagnostics: Diagnostics | null) {
  if (!diagnostics) return null;
  if (!diagnostics.servicesEnabled) {
    // Distinct from the app-permission checks below: this is the phone's
    // system-wide GPS/Location toggle. A driver can have granted every
    // permission this app asks for and still send nothing, because
    // permissions being "granted" only means the app is allowed to use
    // location *if* the device is providing any — with the system toggle
    // off, hasStarted can still read true (the background task is
    // registered fine) while zero fixes ever actually arrive.
    return {
      label: 'Location is off',
      tone: 'bad' as Tone,
      detail: "Your phone's Location/GPS is switched off system-wide — dispatch can't see you until it's back on, even though the app itself is allowed to use it.",
    };
  }
  const blocked = diagnostics.foregroundStatus === 'denied' || diagnostics.backgroundStatus === 'denied';
  if (blocked) {
    return { label: 'Needs attention', tone: 'bad' as Tone, detail: "Dispatch can't see your location until you allow it in Settings." };
  }
  if (diagnostics.hasStarted && diagnostics.foregroundStatus === 'granted' && diagnostics.backgroundStatus !== 'granted') {
    // Previously this fell into the "Active" branch below — foreground
    // tracking genuinely is running, but background permission was never
    // granted (most commonly just never explicitly asked/answered, i.e.
    // 'undetermined', not an outright 'denied') rather than a hardware/
    // permission a driver would think to check. The visible effect is the
    // same either way: the moment this driver backgrounds the app or locks
    // their phone, their marker on dispatch's map goes stale with nothing
    // in the app having told them that would happen.
    return {
      label: 'Foreground only',
      tone: 'neutral' as Tone,
      detail: 'Dispatch only sees your position while this app is open. Allow "All the time" in Settings to keep sharing while your phone is locked.',
    };
  }
  if (diagnostics.hasStarted && diagnostics.foregroundStatus === 'granted') {
    return { label: 'Active', tone: 'good' as Tone, detail: 'Your position is being shared with dispatch.' };
  }
  return { label: 'Not set up', tone: 'neutral' as Tone, detail: "Location sharing hasn't started yet." };
}

// A bordered card per section, per the dispatcher-provided design — the
// driver is reviewing distinct, dispatch-owned facts about themselves
// (vehicle specs, connectivity health, security settings), not scanning one
// continuous manifest, so a boxed layout reads better here than the flat
// divided lists used elsewhere in the app.
function Card({
  icon,
  title,
  summary,
  summaryTone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary?: string;
  summaryTone?: Tone;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={17} color={theme.colors.primary} />
        <Text style={styles.cardTitle}>{title}</Text>
        {summary ? (
          <Text style={[styles.cardSummary, summaryTone ? { color: TONE_COLOR[summaryTone] } : null]} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusValueWrap}>
        <View style={[styles.statusDot, { backgroundColor: TONE_COLOR[tone] }]} />
        <Text style={[styles.statusValue, { color: TONE_COLOR[tone] }]}>{value}</Text>
      </View>
    </View>
  );
}

// Plain facts (a weight limit, a plate number) rather than a health status
// — no color-coded dot, since there's no good/bad judgment to signal.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatDeliveredDate(value?: string | null) {
  if (!value) return 'Date unknown';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ProfileScreen() {
  const { token, pendingSyncCount, isOffline, biometricEnabled, enableBiometric, disableBiometric, signOut } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [sendingPing, setSendingPing] = useState(false);
  const [pingToast, setPingToast] = useState<Toast | null>(null);
  const [togglingBiometric, setTogglingBiometric] = useState(false);

  // undefined = still loading; null = confirmed there isn't one yet.
  const [vehicle, setVehicle] = useState<MyVehicle | null | undefined>(undefined);
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDelivery[] | undefined>(undefined);
  const [documentsVerified, setDocumentsVerified] = useState<boolean | null | undefined>(undefined);
  const [approvedDocCount, setApprovedDocCount] = useState(0);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Temporary — reads back real answers to "is the update mechanism working
  // at all on this device" (reachability + whether a newer update exists)
  // instead of guessing from symptoms. Remove once OTA delivery is trusted.
  const [updateCheck, setUpdateCheck] = useState<{ status: 'checking' | 'done' | 'error' | 'installing'; isAvailable?: boolean; reason?: string; message?: string }>({
    status: 'checking',
  });

  const runUpdateCheck = () => {
    setUpdateCheck({ status: 'checking' });
    Updates.checkForUpdateAsync()
      .then((result) =>
        setUpdateCheck({ status: 'done', isAvailable: result.isAvailable, reason: result.isAvailable ? undefined : result.reason })
      )
      .catch((err) => setUpdateCheck({ status: 'error', message: err instanceof Error ? err.message : String(err) }));
  };

  useEffect(runUpdateCheck, []);

  // Waiting on expo-updates' own background fetch-then-apply-on-next-launch
  // cycle turned out to be unreliable on at least one real device this
  // session — a check would correctly report an update as available, yet
  // it would still be showing as the embedded build after several full
  // restarts. Doing fetch + reload manually, in the foreground, in
  // response to a tap removes that timing dependency entirely.
  const onInstallUpdate = async () => {
    setUpdateCheck({ status: 'installing' });
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setUpdateCheck({ status: 'done', isAvailable: false, reason: check.reason });
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (err) {
      setUpdateCheck({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const loadDiagnostics = async () => {
    setDiagnostics(await getTrackingDiagnostics());
  };

  // useFocusEffect (not a plain useEffect) so this re-runs every time the
  // tab is switched back to — tab screens stay mounted in the background,
  // so a plain mount-only effect would keep showing whatever was fetched on
  // the very first visit.
  useFocusEffect(
    useCallback(() => {
      loadDiagnostics();
      if (!token) return;
      // Every catch below intentionally does nothing but swallow the
      // error — this effect reruns on every tab focus, so a driver who
      // switches tabs while briefly offline would otherwise have their
      // name, vehicle, verification badge, and delivery history wiped
      // back to "loading"/"none" sentinels on every single refetch,
      // even though each of those loaded fine moments earlier. Leaving
      // state untouched on failure keeps the last-known-good data on
      // screen until a refetch actually succeeds.
      fetchMyProfile(token).then(setProfile).catch(() => {});
      fetchMyVehicle(token).then(setVehicle).catch(() => {});
      fetchMyCompletedDeliveries(token).then(setCompletedDeliveries).catch(() => {});
      fetchMyDocuments(token)
        .then((data) => {
          setDocumentsVerified(data.verified);
          setApprovedDocCount(data.checklist.filter((d) => d.status === 'approved').length);
        })
        .catch(() => {});
    }, [token])
  );

  const deliveredThisWeekCount = (completedDeliveries || []).filter((item) => {
    if (!item.confirmed_at) return false;
    return Date.now() - new Date(item.confirmed_at).getTime() <= ONE_WEEK_MS;
  }).length;

  const logout = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const onSendPing = async () => {
    if (!token) return;
    setSendingPing(true);
    setPingToast(null);
    try {
      const result = await sendTestLocationPing(token);
      await loadDiagnostics();
      if (result.ok) {
        setPingToast({ icon: 'checkmark-circle-outline', message: `Sent — dispatch now sees you at ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}.`, tone: 'success' });
      } else {
        setPingToast({ icon: 'alert-circle-outline', message: result.error, tone: 'error' });
      }
    } finally {
      setSendingPing(false);
    }
  };

  const onToggleBiometric = async () => {
    setTogglingBiometric(true);
    try {
      if (biometricEnabled) {
        await disableBiometric();
      } else {
        await enableBiometric();
      }
    } finally {
      setTogglingBiometric(false);
    }
  };

  const locationStatus = overallLocationStatus(diagnostics);
  const displayName = profile?.fullName || 'Driver';
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <>
    <ScreenShell>
      <SectionHeader eyebrow="Operator" title="Profile" />

      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          {profile ? <Text style={styles.avatarInitial}>{initial}</Text> : null}
        </View>
        {/* Until the profile resolves this used to render the literal
            fallback "Driver" with a "D" avatar, which reads as real data
            that happens to be wrong rather than as loading — drivers
            reported their name "disappearing" after a connection wobble.
            A skeleton block says "not yet" unambiguously. */}
        {profile ? (
          <View style={styles.nameRow}>
            <Text style={styles.name}>{displayName}</Text>
            {documentsVerified === true ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} /> : null}
          </View>
        ) : (
          <View
            style={[styles.skeleton, styles.skeletonName]}
            accessibilityLabel="Loading your profile"
          />
        )}
        {profile?.staffId ? (
          <View style={styles.staffBadge}>
            <Ionicons name="id-card-outline" size={12} color={theme.colors.primary} />
            <Text style={styles.staffBadgeText}>{profile.staffId} · Freight Driver</Text>
          </View>
        ) : profile ? null : (
          <View style={[styles.skeleton, styles.skeletonBadge]} />
        )}
        {vehicle ? (
          <View style={styles.identityVehiclePill}>
            <Ionicons name="car-outline" size={12} color={theme.colors.muted} />
            <Text style={styles.identityVehicleText}>{vehicle.plateNumber}</Text>
          </View>
        ) : vehicle === undefined ? (
          // undefined = still loading; null = confirmed no vehicle assigned,
          // in which case showing nothing is correct.
          <View style={[styles.skeleton, styles.skeletonPill]} />
        ) : null}
      </View>

      {documentsVerified === false ? (
        <TouchableOpacity onPress={() => router.push('/(app)/documents')} activeOpacity={0.7} style={styles.notice}>
          <View style={[styles.noticeRail, { backgroundColor: theme.colors.warning }]} />
          <Ionicons name="alert-circle-outline" size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Verification incomplete</Text>
            <Text style={styles.noticeDetail}>
              {approvedDocCount} of 5 documents approved — assignments are withheld until verification is complete.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      ) : documentsVerified === true ? (
        <View style={styles.notice}>
          <View style={[styles.noticeRail, { backgroundColor: theme.colors.success }]} />
          <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Verified</Text>
            <Text style={styles.noticeDetail}>All required documents are approved.</Text>
          </View>
        </View>
      ) : null}

      <Card icon="car-outline" title="Vehicle">
        {vehicle === undefined ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
        ) : vehicle ? (
          <View style={styles.statusRows}>
            <InfoRow label="Type" value={vehicle.vehicleType.replace(/_/g, ' ')} />
            <InfoRow label="Max weight" value={vehicle.maxWeightKg != null ? `${Number(vehicle.maxWeightKg).toFixed(0)} kg` : 'Not recorded'} />
            <InfoRow label="Max range" value={vehicle.maxRangeKm != null ? `${Number(vehicle.maxRangeKm).toFixed(0)} km` : 'Not recorded'} />
            <InfoRow label="Plate" value={vehicle.plateNumber} />
          </View>
        ) : (
          <View style={styles.emptyInline}>
            <Ionicons name="car-outline" size={20} color={theme.colors.muted} />
            <Text style={styles.emptyInlineText}>No vehicle assigned yet — contact dispatch to get one.</Text>
          </View>
        )}
      </Card>

      <Card icon="radio-outline" title="Connectivity" summary={locationStatus?.label} summaryTone={locationStatus?.tone}>
        {locationStatus ? (
          <View style={styles.overallStatusRow}>
            <Ionicons
              name={locationStatus.tone === 'good' ? 'checkmark-circle' : locationStatus.tone === 'bad' ? 'alert-circle' : 'time-outline'}
              size={20}
              color={TONE_COLOR[locationStatus.tone]}
            />
            {/* The status word itself (Active / Needs attention / Not set
                up) already reads as the card's summary badge up in the
                header — repeating it again in bold right here added no
                information, just the same word twice in two sizes. */}
            <View style={{ flex: 1 }}>
              <Text style={styles.overallStatusDetail}>{locationStatus.detail}</Text>
            </View>
          </View>
        ) : (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
        )}

        {diagnostics ? (
          <View style={styles.statusRows}>
            <StatusRow label="Location access" {...humanizePermission(diagnostics.foregroundStatus)} />
            <StatusRow label="Background tracking" {...humanizePermission(diagnostics.backgroundStatus)} />
            <StatusRow
              label="Network"
              value={isOffline ? 'Offline' : 'Connected'}
              tone={isOffline ? 'bad' : 'good'}
            />
            <StatusRow
              label="Sync queue"
              value={pendingSyncCount === 0 ? 'Up to date' : `${pendingSyncCount} pending`}
              tone={pendingSyncCount === 0 ? 'good' : 'neutral'}
            />
          </View>
        ) : null}

        {locationStatus?.tone === 'bad' ? (
          <TouchableOpacity style={styles.dangerButton} activeOpacity={0.9} onPress={() => Linking.openSettings()}>
            <Ionicons name="settings-outline" size={15} color={theme.colors.ink} />
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={onSendPing} activeOpacity={0.9} disabled={sendingPing}>
            {sendingPing ? (
              <ActivityIndicator color={theme.colors.ink} />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={16} color={theme.colors.ink} />
                <Text style={styles.primaryButtonText}>Send a location update now</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </Card>

      <Card icon="key-outline" title="Security">
        <View style={styles.statusRows}>
          <InfoRow label="Sign-in method" value="4-digit PIN" />
        </View>

        <View style={styles.biometricRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.biometricTitle}>Biometric login</Text>
            <Text style={styles.biometricDetail}>Unlock the app with your fingerprint or face instead of your PIN.</Text>
          </View>
          <TouchableOpacity
            onPress={onToggleBiometric}
            disabled={togglingBiometric}
            style={[styles.toggle, biometricEnabled && styles.toggleOn]}
            activeOpacity={0.85}
          >
            <View style={[styles.toggleKnob, biometricEnabled && styles.toggleKnobOn]} />
          </TouchableOpacity>
        </View>

        <Text style={styles.microcopy}>Forgot your PIN? Contact your dispatcher to have it reset.</Text>
      </Card>

      <Card icon="help-buoy-outline" title="Support">
        <Text style={styles.supportText}>
          If you lose connectivity, keep the app open — queued updates sync automatically once you&apos;re back in range.
        </Text>
        <TouchableOpacity style={styles.supportButton} activeOpacity={0.9} onPress={() => router.push('/(app)/incidents')}>
          <Ionicons name="warning-outline" size={15} color={theme.colors.danger} />
          <Text style={styles.supportButtonText}>Report an issue</Text>
        </TouchableOpacity>
      </Card>

      {completedDeliveries === undefined || completedDeliveries.length > 0 ? (
        <Card icon="time-outline" title="Delivery history" summary={completedDeliveries && completedDeliveries.length > 0 ? `${deliveredThisWeekCount} this week` : undefined}>
          {completedDeliveries === undefined ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
          ) : completedDeliveries.length === 0 ? (
            // Previously rendered an empty View, so a driver who hadn't
            // completed a delivery yet saw a titled card with nothing in it.
            <EmptyState
              compact
              icon="cube-outline"
              title="No deliveries yet"
              body="Once you confirm a delivery it appears here with its photo proof."
            />
          ) : (
            <>
              <View>
                {completedDeliveries.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>{item.cargo_description || `Shipment #${item.id}`}</Text>
                      <Text style={styles.historyMeta}>{item.origin_hub_name || 'Origin unknown'} · {formatDeliveredDate(item.confirmed_at)}</Text>
                    </View>
                    {item.photo_url ? (
                      <TouchableOpacity onPress={() => setViewingPhoto(item.photo_url as string)} hitSlop={8}>
                        <Ionicons name="image-outline" size={18} color={theme.colors.accent} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
              {completedDeliveries.length > 8 ? (
                <Text style={styles.historyMore}>+{completedDeliveries.length - 8} more in your history</Text>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      <TouchableOpacity onPress={logout} style={styles.logout} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={16} color={theme.colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>

      {/* Embedded/OTA build diagnostics only mean anything for a real
          preview/production build with an actual update channel — a
          dev-client build loads JS straight from Metro, so isEmbeddedLaunch/
          updateId/channel and "check & install update" are all meaningless
          (or actively confusing) noise here. */}
      {!__DEV__ && (
        <>
          <Text style={styles.diagnosticFooter}>
            {Updates.isEmbeddedLaunch ? 'embedded build' : 'ota update'} · {Updates.updateId ? Updates.updateId.slice(0, 8) : 'no update id'} · channel: {Updates.channel ?? 'n/a'} · runtime: {Updates.runtimeVersion ?? 'n/a'}
            {'\n'}
            update check:{' '}
            {updateCheck.status === 'checking'
              ? 'checking…'
              : updateCheck.status === 'error'
                ? `failed — ${updateCheck.message}`
                : updateCheck.status === 'installing'
                  ? 'downloading and installing…'
                  : updateCheck.isAvailable
                    ? 'newer update found'
                    : `none pending (${updateCheck.reason ?? 'unknown reason'})`}
          </Text>

          <TouchableOpacity onPress={() => void onInstallUpdate()} disabled={updateCheck.status === 'installing'} style={styles.updateButton} activeOpacity={0.8}>
            {updateCheck.status === 'installing' ? (
              <ActivityIndicator color={theme.colors.primary} size="small" />
            ) : (
              <Text style={styles.updateButtonText}>Check &amp; install update now</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScreenShell>
    <ImageViewerModal url={viewingPhoto} onClose={() => setViewingPhoto(null)} />
    <ToastOverlay toast={pingToast} onHide={() => setPingToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Deliberately sized to match the real content each one stands in for,
  // so the card doesn't jump when the data arrives.
  skeleton: {
    backgroundColor: theme.colors.panelSoft,
    borderRadius: theme.radius.sm,
  },
  skeletonName: { width: 168, height: 26, marginTop: 4 },
  skeletonBadge: { width: 196, height: 24, marginTop: 10, borderRadius: theme.radius.pill },
  skeletonPill: { width: 104, height: 20, marginTop: 8, borderRadius: theme.radius.pill },
  identityCard: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
    marginBottom: 16,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: `${theme.colors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarInitial: { color: theme.colors.primary, ...theme.type.display, fontFamily: theme.fonts.headingBlack },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: theme.colors.text, ...theme.type.title, fontFamily: theme.fonts.headingBlack },
  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.panelSoft,
    marginTop: 6,
  },
  staffBadgeText: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.8 },
  identityVehiclePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  identityVehicleText: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.mono },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  noticeRail: { width: 3, height: 28, borderRadius: 2 },
  noticeTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  noticeDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.body },
  card: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardTitle: { flex: 1, color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  cardSummary: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold, maxWidth: 130 },
  cardBody: { gap: 12 },
  overallStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  overallStatusDetail: { color: theme.colors.muted, ...theme.type.label, marginTop: 2, lineHeight: 17, fontFamily: theme.fonts.body },
  statusRows: { gap: 10 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  statusValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 99 },
  statusValue: { ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  infoValue: { color: theme.colors.text, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold, textTransform: 'capitalize' },
  emptyInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyInlineText: { flex: 1, color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  historyTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  historyMeta: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.mono },
  historyMore: { color: theme.colors.muted, ...theme.type.micro, textAlign: 'center', fontFamily: theme.fonts.body },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
  },
  primaryButtonText: { color: theme.colors.ink, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
  },
  biometricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  biometricTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  biometricDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.body },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: `${theme.colors.primary}33`, borderColor: theme.colors.primary },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.muted },
  toggleKnobOn: { backgroundColor: theme.colors.primary, alignSelf: 'flex-end' },
  microcopy: { color: theme.colors.muted, ...theme.type.micro, textAlign: 'center', marginTop: 14, fontFamily: theme.fonts.body },
  supportText: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  supportButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 12 },
  supportButtonText: { color: theme.colors.danger, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  logout: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
  },
  logoutText: { color: theme.colors.danger, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  diagnosticFooter: {
    color: theme.colors.muted,
    ...theme.type.micro,
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 16,
    fontFamily: theme.fonts.mono,
    opacity: 0.6,
  },
  updateButton: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  updateButtonText: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono, opacity: 0.8 },
});
