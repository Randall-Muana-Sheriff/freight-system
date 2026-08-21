import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import {
  fetchTodaySafetyChecklist,
  updateSafetyChecklistItem,
  fetchOpenVehicleDefects,
  type SafetyChecklistResults,
  type SafetyCheckResult,
  type VehicleDefect,
} from '../lib/api';
import { captureException } from '../lib/crashReporting';
import { ReportDefectModal } from './ReportDefectModal';
import { ToastOverlay, type Toast } from './ToastOverlay';

// Kept in sync by hand with SAFETY_CHECKLIST_ITEMS in
// safetyChecklistController.js — the canonical list lives in application
// code on both sides rather than the database, so there's nothing to fetch
// before rendering the item labels themselves (only their checked state
// needs a round trip).
const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'seatbelt', label: 'Seatbelt fastened' },
  { key: 'mirrorsLights', label: 'Mirrors & lights checked' },
  { key: 'tyres', label: 'Tyre condition & pressure checked' },
  { key: 'cargo', label: 'Cargo secured' },
  { key: 'fatigue', label: 'Rested and fit to drive' },
];

export function SafetyChecklistCard() {
  const { token } = useAuth();
  const [results, setResults] = useState<SafetyChecklistResults>({});
  const [defects, setDefects] = useState<VehicleDefect[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which single item is mid-request, not a screen-wide flag — so
  // tapping one row doesn't visually freeze the four rows you didn't tap.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Which item the report modal is open for, or null. Holding the key rather
  // than a boolean means the modal always knows what it is reporting on.
  const [reporting, setReporting] = useState<{ key: string; label: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchTodaySafetyChecklist(token)
        .then((data) => {
          if (!cancelled) setResults(data.results || {});
        })
        .catch(() => {
          // Best-effort — an empty (nothing-checked) checklist is a safe
          // fallback if this fails, not worth a screen-level error state.
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      // Separate call, deliberately not blocking the checklist: what is
      // already wrong with this truck is worth showing even if today's
      // checklist fails to load, and vice versa.
      fetchOpenVehicleDefects(token)
        .then((data) => {
          if (!cancelled) setDefects(data.defects || []);
        })
        .catch(() => {
          // A driver seeing no banner must mean "nothing open", so a failure
          // here is reported rather than silently showing an all-clear.
          captureException(new Error('Could not load open vehicle defects'), { screen: 'safety-checklist' });
        });
      return () => {
        cancelled = true;
      };
    }, [token])
  );

  const setResult = async (key: string, next: SafetyCheckResult, note?: string) => {
    if (!token || pendingKey) return;
    const previous = results[key] ?? 'unchecked';
    setPendingKey(key);
    setResults((current) => ({ ...current, [key]: next })); // optimistic
    try {
      const data = await updateSafetyChecklistItem(token, key, next, note);
      setResults(data.results || {});
      if (data.defectId) {
        // Confirm on the spot. A driver who reports a fault and sees the row
        // simply turn red has no way to know whether anyone was told.
        setToast({
          icon: 'checkmark-circle-outline',
          tone: 'success',
          message: 'Fault reported — dispatch has been notified.',
        });
        // Pull the banner again so the fault they just raised joins the ones
        // already on the vehicle, rather than appearing only on next visit.
        if (token) {
          fetchOpenVehicleDefects(token)
            .then((d) => setDefects(d.defects || []))
            .catch(() => {});
        }
      }
    } catch {
      setResults((current) => ({ ...current, [key]: previous })); // revert
    } finally {
      setPendingKey(null);
    }
  };

  // A tap marks the check passed, or clears it again. Failing is a separate,
  // deliberate action rather than a third position in a cycle — cycling
  // through "fail" to get back to "unchecked" would raise a defect every
  // time somebody undid a mis-tap.
  const onToggle = (key: string) => {
    void setResult(key, results[key] === 'pass' ? 'unchecked' : 'pass');
  };

  const onFail = (key: string, label: string) => {
    if (results[key] === 'fail') {
      void setResult(key, 'unchecked');
      return;
    }
    setReporting({ key, label });
  };

  const passedCount = CHECKLIST_ITEMS.filter((item) => results[item.key] === 'pass').length;
  const failedCount = CHECKLIST_ITEMS.filter((item) => results[item.key] === 'fail').length;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Pre-departure check</Text>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Text style={styles.progress}>
            {passedCount} of {CHECKLIST_ITEMS.length}
            {failedCount > 0 ? `  ·  ${failedCount} fault${failedCount > 1 ? 's' : ''}` : ''}
          </Text>
        )}
      </View>

      {/* Before the checks, not after them. A fault someone else found
          yesterday is the thing this driver most needs to know before
          walking round the vehicle, and it is the reason a defect belongs to
          the truck rather than to whoever reported it. */}
      {defects.length > 0 && (
        <View style={styles.defectBanner}>
          <Ionicons name="build-outline" size={16} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.defectTitle}>
              {defects.length} open {defects.length > 1 ? 'faults' : 'fault'} on this vehicle
            </Text>
            {defects.slice(0, 3).map((d) => (
              <Text key={d.id} style={styles.defectLine} numberOfLines={2}>
                {d.description.replace(/^Pre-departure check failed: /, '')}
              </Text>
            ))}
          </View>
        </View>
      )}
      {CHECKLIST_ITEMS.map((item) => {
        const state = results[item.key] ?? 'unchecked';
        const passed = state === 'pass';
        const failed = state === 'fail';
        return (
          <View key={item.key} style={styles.row}>
            <TouchableOpacity
              style={styles.rowMain}
              activeOpacity={0.7}
              disabled={loading}
              onPress={() => onToggle(item.key)}
              // The state is drawn as an icon, so without an explicit
              // checkbox role a screen reader announces only the label and
              // gives no way to tell a completed check from an outstanding
              // one — or from a failed one.
              accessibilityRole="checkbox"
              accessibilityState={{ checked: passed, disabled: loading }}
              accessibilityLabel={failed ? `${item.label}. Reported as a fault.` : item.label}
            >
              <Ionicons
                name={failed ? 'alert-circle' : passed ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={failed ? theme.colors.danger : passed ? theme.colors.primary : theme.colors.muted}
              />
              <Text style={[styles.label, passed && styles.labelChecked, failed && styles.labelFailed]}>
                {item.label}
              </Text>
            </TouchableOpacity>

            {/* Its own target rather than a third position in the tap cycle:
                cycling through "fail" to clear a mis-tap would raise a defect
                every time. */}
            <TouchableOpacity
              style={styles.failButton}
              activeOpacity={0.7}
              disabled={loading}
              onPress={() => onFail(item.key, item.label)}
              accessibilityRole="button"
              accessibilityLabel={failed ? `Clear the fault on ${item.label}` : `Report a fault with ${item.label}`}
            >
              <Ionicons
                name={failed ? 'close-circle' : 'flag-outline'}
                size={18}
                color={failed ? theme.colors.danger : theme.colors.muted}
              />
            </TouchableOpacity>
          </View>
        );
      })}
      <ReportDefectModal
        visible={reporting !== null}
        itemLabel={reporting?.label ?? ''}
        onCancel={() => setReporting(null)}
        onReport={(note) => {
          const target = reporting;
          setReporting(null);
          if (target) void setResult(target.key, 'fail', note || undefined);
        }}
      />
      <ToastOverlay toast={toast} onHide={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // surface3: the only card on the Safety tab, and the one thing there
    // a driver is meant to complete before setting off.
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 20,
    gap: 4,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  progress: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  failButton: { paddingHorizontal: 8, paddingVertical: 6 },
  defectBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colors.panelSoft,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    padding: 12,
    marginBottom: 12,
  },
  defectTitle: { color: theme.colors.warning, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  defectLine: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.body, marginTop: 2 },
  label: { flex: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  labelChecked: { color: theme.colors.muted, textDecorationLine: 'line-through' },
  labelFailed: { color: theme.colors.danger },
});
