import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { InlineBanner, type BannerTone } from '../../components/InlineBanner';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { changePassword, fetchMyVehicle, fetchMyCompletedDeliveries, type MyVehicle, type CompletedDelivery } from '../../lib/api';
import { getTrackingDiagnostics, sendTestLocationPing } from '../../lib/locationTracking';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type Diagnostics = Awaited<ReturnType<typeof getTrackingDiagnostics>>;
type Banner = { tone: BannerTone; icon: keyof typeof Ionicons.glyphMap; message: string };
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
  const blocked = diagnostics.foregroundStatus === 'denied' || diagnostics.backgroundStatus === 'denied';
  if (blocked) {
    return { label: 'Needs attention', tone: 'bad' as Tone, detail: "Dispatch can't see your location until you allow it in Settings." };
  }
  if (diagnostics.hasStarted && diagnostics.foregroundStatus === 'granted') {
    return { label: 'Active', tone: 'good' as Tone, detail: 'Your position is being shared with dispatch.' };
  }
  return { label: 'Not set up', tone: 'neutral' as Tone, detail: "Location sharing hasn't started yet." };
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
  const { username, token, pendingSyncCount, signOut } = useAuth();
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [sendingPing, setSendingPing] = useState(false);
  const [pingBanner, setPingBanner] = useState<Banner | null>(null);

  // undefined = still loading; null = confirmed there isn't one yet.
  const [vehicle, setVehicle] = useState<MyVehicle | null | undefined>(undefined);
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDelivery[] | undefined>(undefined);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordShowErrors, setPasswordShowErrors] = useState(false);
  const [passwordBanner, setPasswordBanner] = useState<Banner | null>(null);

  const loadDiagnostics = async () => {
    setDiagnostics(await getTrackingDiagnostics());
  };

  useEffect(() => {
    loadDiagnostics();
    if (!token) return;
    fetchMyVehicle(token)
      .then(setVehicle)
      .catch(() => setVehicle(null));
    fetchMyCompletedDeliveries(token)
      .then(setCompletedDeliveries)
      .catch(() => setCompletedDeliveries([]));
  }, [token]);

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
    setPingBanner(null);
    try {
      const result = await sendTestLocationPing(token);
      await loadDiagnostics();
      if (result.ok) {
        setPingBanner({ tone: 'success', icon: 'checkmark-circle-outline', message: `Sent — dispatch now sees you at ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}.` });
      } else {
        setPingBanner({ tone: 'danger', icon: 'alert-circle-outline', message: result.error });
      }
    } finally {
      setSendingPing(false);
    }
  };

  const currentPasswordMissing = passwordShowErrors && !currentPassword;
  const newPasswordMissing = passwordShowErrors && !newPassword;
  const newPasswordTooShort = passwordShowErrors && !!newPassword && newPassword.length < 8;
  const confirmMismatch = passwordShowErrors && !!confirmPassword && newPassword !== confirmPassword;

  const onChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      setPasswordShowErrors(true);
      setPasswordBanner({ tone: 'danger', icon: 'alert-circle-outline', message: 'Check the fields below and try again.' });
      return;
    }

    setChangingPassword(true);
    setPasswordBanner(null);
    try {
      await changePassword(token, currentPassword, newPassword);
      // Changing the password revokes every session server-side, including
      // this one — an explicit, blocking confirmation here (rather than the
      // inline banners used elsewhere) is deliberate: the driver needs to
      // understand why they're about to land back on the login screen.
      Alert.alert('Password updated', 'Please sign in again with your new password.', [
        {
          text: 'OK',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]);
    } catch (error) {
      setPasswordBanner({
        tone: 'danger',
        icon: 'alert-circle-outline',
        message: error instanceof Error ? error.message : 'Failed to update password.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const locationStatus = overallLocationStatus(diagnostics);

  return (
    <ScreenShell>
      <SectionHeader eyebrow="Operator" title="Profile" subtitle="Account, location sharing, and security." />

      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={28} color={theme.colors.primary} />
        </View>
        <Text style={styles.name}>{username || 'Driver'}</Text>
        <Text style={styles.role}>Assigned driver account</Text>
      </View>

      <Text style={styles.sectionLabel}>Your vehicle</Text>
      <View style={styles.card}>
        {vehicle === undefined ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
        ) : vehicle ? (
          <>
            <View style={styles.vehicleHeaderRow}>
              <View style={styles.vehicleIconWrap}>
                <Ionicons name="car-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehiclePlate}>{vehicle.plateNumber}</Text>
                <Text style={styles.vehicleType}>{vehicle.vehicleType.replace(/_/g, ' ')}</Text>
              </View>
            </View>
            <View style={styles.statusRows}>
              <InfoRow label="Max weight" value={vehicle.maxWeightKg != null ? `${Number(vehicle.maxWeightKg).toFixed(0)} kg` : 'Not recorded'} />
              <InfoRow label="Max range" value={vehicle.maxRangeKm != null ? `${Number(vehicle.maxRangeKm).toFixed(0)} km` : 'Not recorded'} />
            </View>
          </>
        ) : (
          <View style={styles.emptyInline}>
            <Ionicons name="car-outline" size={20} color={theme.colors.muted} />
            <Text style={styles.emptyInlineText}>No vehicle assigned yet — contact dispatch to get one.</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>Delivery history</Text>
      <View style={styles.card}>
        {completedDeliveries === undefined ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
        ) : completedDeliveries.length === 0 ? (
          <View style={styles.emptyInline}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color={theme.colors.muted} />
            <Text style={styles.emptyInlineText}>No completed deliveries yet — they'll show up here once you deliver your first job.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.historyStat}>
              <Text style={styles.historyStatNumber}>{deliveredThisWeekCount}</Text> delivered this week
            </Text>
            <View style={{ gap: 8 }}>
              {completedDeliveries.slice(0, 8).map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{item.cargo_description || `Shipment #${item.id}`}</Text>
                    <Text style={styles.historyMeta}>{item.origin_hub_name || 'Origin unknown'} · {formatDeliveredDate(item.confirmed_at)}</Text>
                  </View>
                  {item.photo_url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(item.photo_url as string)} hitSlop={8}>
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
      </View>

      <Text style={styles.sectionLabel}>Connectivity</Text>
      <View style={styles.card}>
        {pingBanner ? (
          <InlineBanner tone={pingBanner.tone} icon={pingBanner.icon} message={pingBanner.message} onDismiss={() => setPingBanner(null)} />
        ) : null}

        {locationStatus ? (
          <View style={styles.overallStatusRow}>
            <Ionicons
              name={locationStatus.tone === 'good' ? 'checkmark-circle' : locationStatus.tone === 'bad' ? 'alert-circle' : 'time-outline'}
              size={20}
              color={TONE_COLOR[locationStatus.tone]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.overallStatusLabel, { color: TONE_COLOR[locationStatus.tone] }]}>{locationStatus.label}</Text>
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
              label="Sync queue"
              value={pendingSyncCount === 0 ? 'Up to date' : `${pendingSyncCount} pending`}
              tone={pendingSyncCount === 0 ? 'good' : 'neutral'}
            />
          </View>
        ) : null}

        {locationStatus?.tone === 'bad' ? (
          <TouchableOpacity style={styles.settingsButton} activeOpacity={0.9} onPress={() => Linking.openSettings()}>
            <Ionicons name="settings-outline" size={15} color={theme.colors.paper} />
            <Text style={styles.settingsButtonText}>Open Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pingButton} onPress={onSendPing} activeOpacity={0.9} disabled={sendingPing}>
            {sendingPing ? (
              <ActivityIndicator color={theme.colors.paper} />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={16} color={theme.colors.paper} />
                <Text style={styles.pingButtonText}>Send a location update now</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionLabel}>Security</Text>
      <View style={styles.card}>
        {passwordBanner ? (
          <InlineBanner tone={passwordBanner.tone} icon={passwordBanner.icon} message={passwordBanner.message} onDismiss={() => setPasswordBanner(null)} />
        ) : null}

        <Text style={styles.label}>Current password</Text>
        <TextInput
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, currentPasswordMissing && styles.inputError]}
          value={currentPassword}
          onChangeText={(value) => {
            setCurrentPassword(value);
            setPasswordBanner(null);
          }}
        />
        {currentPasswordMissing ? <Text style={styles.fieldError}>Enter your current password.</Text> : null}

        <Text style={styles.label}>New password</Text>
        <TextInput
          secureTextEntry
          placeholder="At least 8 characters"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, (newPasswordMissing || newPasswordTooShort) && styles.inputError]}
          value={newPassword}
          onChangeText={(value) => {
            setNewPassword(value);
            setPasswordBanner(null);
          }}
        />
        {newPasswordMissing ? <Text style={styles.fieldError}>Enter a new password.</Text> : null}
        {!newPasswordMissing && newPasswordTooShort ? <Text style={styles.fieldError}>Must be at least 8 characters.</Text> : null}

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          secureTextEntry
          placeholder="Re-enter new password"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, confirmMismatch && styles.inputError]}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setPasswordBanner(null);
          }}
        />
        {confirmMismatch ? <Text style={styles.fieldError}>Passwords don't match.</Text> : null}

        <TouchableOpacity activeOpacity={0.9} style={styles.pingButton} onPress={onChangePassword} disabled={changingPassword}>
          {changingPassword ? (
            <ActivityIndicator color={theme.colors.paper} />
          ) : (
            <>
              <Ionicons name="key-outline" size={16} color={theme.colors.paper} />
              <Text style={styles.pingButtonText}>Update password</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.microcopy}>You'll need to sign in again afterward, on every device.</Text>
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.card}>
        <Text style={styles.supportText}>
          If you lose connectivity, keep the app open — queued updates sync automatically once you're back in range.
        </Text>
        <TouchableOpacity style={styles.supportButton} activeOpacity={0.9} onPress={() => router.push('/(app)/incidents')}>
          <Ionicons name="warning-outline" size={15} color={theme.colors.warning} />
          <Text style={styles.supportButtonText}>Report an issue</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={logout} style={styles.logout} activeOpacity={0.9}>
        <Ionicons name="log-out-outline" size={16} color={theme.colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    alignItems: 'center',
    padding: 24,
    gap: 6,
    marginBottom: 24,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: 'rgba(255,138,61,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  name: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  role: { color: theme.colors.muted, fontSize: 13 },
  sectionLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: mono,
    marginBottom: 10,
  },
  card: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    gap: 12,
    marginBottom: 24,
  },
  overallStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  overallStatusLabel: { fontSize: 15, fontWeight: '800' },
  overallStatusDetail: { color: theme.colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  statusRows: { gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.border },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { color: theme.colors.muted, fontSize: 12 },
  statusValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 99 },
  statusValue: { fontSize: 12, fontWeight: '700' },
  infoValue: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  vehicleHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,138,61,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePlate: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  vehicleType: { color: theme.colors.muted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  emptyInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyInlineText: { flex: 1, color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  historyStat: { color: theme.colors.muted, fontSize: 13 },
  historyStatNumber: { color: theme.colors.text, fontWeight: '900', fontSize: 14 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  historyTitle: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  historyMeta: { color: theme.colors.muted, fontSize: 11, marginTop: 2, fontFamily: mono },
  historyMore: { color: theme.colors.muted, fontSize: 11, textAlign: 'center' },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 6,
    paddingVertical: 13,
  },
  pingButtonText: { color: theme.colors.paper, fontSize: 13, fontWeight: '800' },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.danger,
    borderRadius: 6,
    paddingVertical: 13,
  },
  settingsButtonText: { color: theme.colors.paper, fontSize: 13, fontWeight: '800' },
  label: { color: theme.colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontFamily: mono, marginTop: 4 },
  input: {
    borderRadius: 6,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    color: theme.colors.text,
    fontSize: 14,
  },
  inputError: { borderColor: theme.colors.danger },
  fieldError: { color: theme.colors.danger, fontSize: 11, marginTop: -6 },
  microcopy: { color: theme.colors.muted, fontSize: 11, textAlign: 'center', marginTop: -2 },
  supportText: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  supportButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  supportButtonText: { color: theme.colors.warning, fontSize: 13, fontWeight: '800' },
  logout: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(193,68,46,0.14)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(193,68,46,0.28)',
    paddingVertical: 14,
  },
  logoutText: { color: theme.colors.danger, fontSize: 15, fontWeight: '800' },
});
