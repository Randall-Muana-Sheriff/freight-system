import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { ToastOverlay } from '../../components/ToastOverlay';
import { ActionSheet } from '../../components/ActionSheet';
import { theme } from '../../lib/theme';
import { reportIncident, isNetworkFailure, fetchMyIncidents, type MyIncident } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { enqueueOfflineAction } from '../../lib/offlineQueue';

// Picked from the Incident title field itself (tapping it opens this list)
// so a driver in a stressful moment (right after an accident, standing next
// to a flat tire) doesn't have to compose a title from scratch — "Other"
// drops into free text for anything not covered here.
const QUICK_ISSUES: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Flat tire', icon: 'disc-outline' },
  { label: 'Vehicle breakdown', icon: 'construct-outline' },
  { label: 'Accident', icon: 'warning-outline' },
  { label: 'Traffic delay', icon: 'time-outline' },
  { label: 'Route blocked', icon: 'trail-sign-outline' },
];

type Toast = { icon: keyof typeof Ionicons.glyphMap; message: string };

const STATUS_META: Record<MyIncident['status'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  OPEN: { label: 'Awaiting review', color: theme.colors.warning, icon: 'time-outline' },
  ACKNOWLEDGED: { label: 'Being handled', color: theme.colors.accent, icon: 'eye-outline' },
  RESOLVED: { label: 'Resolved', color: theme.colors.success, icon: 'checkmark-circle' },
};

// Submitted as "title\n\ndescription" (see createIncident on the backend)
// — split back apart for display so the report list shows a real title
// instead of the whole blob as one run-on line.
function splitReport(description: string) {
  const [first, ...rest] = description.split('\n\n');
  return { title: first, body: rest.join('\n\n') };
}

function formatReportDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function IncidentsScreen() {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pickingIssue, setPickingIssue] = useState(false);
  // False = the title field shows the picker (tap it, choose a preset or
  // "Other"). True = a driver picked "Other" and the field is now a normal
  // free-text input for a title that isn't one of the presets.
  const [isCustomTitle, setIsCustomTitle] = useState(false);
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const [myIncidents, setMyIncidents] = useState<MyIncident[] | undefined>(undefined);
  const [incidentsLoadFailed, setIncidentsLoadFailed] = useState(false);

  const titleMissing = showErrors && !title.trim();
  const descriptionMissing = showErrors && !description.trim();

  const loadIncidents = useCallback(async () => {
    if (!token) return;
    try {
      setMyIncidents(await fetchMyIncidents(token));
      setIncidentsLoadFailed(false);
    } catch {
      // Previously this set an empty array on any failure, which reads
      // to the driver as "you have no incident reports" — indistinguishable
      // from a genuinely clean history. A failed load and an empty history
      // need different UI, so a real reload option is offered here instead
      // of a misleading empty state.
      setIncidentsLoadFailed(true);
    }
  }, [token]);

  // useFocusEffect so returning to this tab picks up a dispatcher's
  // acknowledge/resolve decision on an earlier report, not just whatever
  // was fetched the first time this screen was ever opened.
  useFocusEffect(
    useCallback(() => {
      loadIncidents();
    }, [loadIncidents])
  );

  const onPickQuickIssue = (issue: string) => {
    setTitle(issue);
    setIsCustomTitle(false);
    setPickingIssue(false);
    setToast(null);
    descriptionRef.current?.focus();
  };

  // "Other" isn't a real title — it's an invitation to type one. Switching
  // the field from a picker into a real TextInput (instead of pre-filling
  // literal "Other" text the way a preset would) is what actually lets a
  // driver describe something not on the list. The field only exists once
  // this flips true, so focusing it has to wait a beat for the sheet's
  // close animation to finish and the TextInput to actually mount.
  const onPickOtherIssue = () => {
    setTitle('');
    setIsCustomTitle(true);
    setPickingIssue(false);
    setToast(null);
    setTimeout(() => titleRef.current?.focus(), 300);
  };

  const onSubmit = async () => {
    if (!token) return;
    if (!title.trim() || !description.trim()) {
      setShowErrors(true);
      setToast({ icon: 'alert-circle-outline', message: 'Add a title and a few details before sending.' });
      return;
    }

    setSending(true);
    setToast(null);
    try {
      await reportIncident(token, { title: title.trim(), description: description.trim() });
      setTitle('');
      setIsCustomTitle(false);
      setDescription('');
      setShowErrors(false);
      setToast({ icon: 'checkmark-circle-outline', message: 'Report sent — dispatch has been notified.' });
      loadIncidents();
    } catch (error) {
      if (isNetworkFailure(error)) {
        await enqueueOfflineAction({
          type: 'incident-report',
          payload: { title: title.trim(), description: description.trim() },
          createdAt: new Date().toISOString(),
        });
        setTitle('');
        setIsCustomTitle(false);
        setDescription('');
        setShowErrors(false);
        setToast({ icon: 'cloud-offline-outline', message: "Saved offline — it'll send as soon as you're back in range." });
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Failed to send incident report.',
        });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <ScreenShell>
      <SectionHeader
        eyebrow="Safety"
        title="Report an issue"
        subtitle="Let dispatch know about a delay, breakdown, or anything blocking your delivery."
      />

      <Text style={styles.label}>Incident title</Text>
      {isCustomTitle ? (
        <View style={[styles.input, styles.selectInput, titleMissing && styles.inputError]}>
          <TextInput
            ref={titleRef}
            placeholder="Describe the issue"
            placeholderTextColor={theme.colors.muted}
            style={styles.customTitleInput}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setToast(null);
            }}
          />
          {/* Typing doesn't have to be a one-way door — tapping back to the
              preset list is always one press away, in case a driver picked
              "Other" but changes their mind. */}
          <TouchableOpacity onPress={() => setPickingIssue(true)} hitSlop={8}>
            <Ionicons name="list-outline" size={18} color={theme.colors.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.input, styles.selectInput, titleMissing && styles.inputError]}
          activeOpacity={0.8}
          onPress={() => setPickingIssue(true)}
        >
          <Text style={title ? styles.selectValue : styles.selectPlaceholder}>{title || 'Select an issue'}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      )}
      {titleMissing ? <Text style={styles.fieldError}>Add a short title.</Text> : null}

      <Text style={styles.label}>Details</Text>
      <TextInput
        ref={descriptionRef}
        placeholder="What happened, where, and what support is needed?"
        placeholderTextColor={theme.colors.muted}
        multiline
        style={[styles.input, styles.textArea, descriptionMissing && styles.inputError]}
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          setToast(null);
        }}
      />
      {descriptionMissing ? <Text style={styles.fieldError}>Add a few details.</Text> : null}

      <TouchableOpacity activeOpacity={0.9} style={styles.button} onPress={onSubmit} disabled={sending}>
        <Ionicons name="warning-outline" size={16} color={theme.colors.paper} />
        <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send report'}</Text>
      </TouchableOpacity>
      <Text style={styles.microcopy}>Works offline — we&apos;ll send it as soon as you&apos;re back in range.</Text>

      <View style={styles.divider} />

      <Text style={styles.historyLabel}>Your recent reports</Text>
      {myIncidents === undefined && !incidentsLoadFailed ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
      ) : myIncidents && myIncidents.length > 0 ? (
        // Checked before incidentsLoadFailed: a report list that already
        // loaded successfully once must stay on screen through a later
        // failed refresh (e.g. connection dropped on this tab's next
        // focus) instead of being replaced by the retry prompt below.
        <View>
          {myIncidents.map((item) => {
            const { title: reportTitle, body } = splitReport(item.description);
            const meta = STATUS_META[item.status];
            return (
              <View key={item.id} style={styles.historyRow}>
                <View style={[styles.historyIconWrap, { backgroundColor: `${meta.color}1F` }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.historyTopRow}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{reportTitle}</Text>
                    <Text style={[styles.historyStatusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {body ? <Text style={styles.historyBody} numberOfLines={2}>{body}</Text> : null}
                  <Text style={styles.historyDate}>{formatReportDate(item.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : incidentsLoadFailed ? (
        <TouchableOpacity style={styles.emptyHistory} onPress={loadIncidents}>
          <Ionicons name="refresh-outline" size={18} color={theme.colors.danger} />
          <Text style={[styles.emptyHistoryText, { color: theme.colors.danger }]}>
            Couldn&apos;t load your reports. Tap to try again.
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyHistory}>
          <Ionicons name="document-text-outline" size={18} color={theme.colors.muted} />
          <Text style={styles.emptyHistoryText}>Nothing reported yet.</Text>
        </View>
      )}
    </ScreenShell>

    <ToastOverlay message={toast?.message ?? null} icon={toast?.icon ?? 'alert-outline'} onHide={() => setToast(null)} />

    <ActionSheet
      visible={pickingIssue}
      title="Select an issue"
      onCancel={() => setPickingIssue(false)}
      options={[
        ...QUICK_ISSUES.map((issue) => ({
          key: issue.label,
          label: issue.label,
          icon: issue.icon,
          onPress: () => onPickQuickIssue(issue.label),
        })),
        { key: 'other', label: 'Other', icon: 'create-outline' as const, onPress: onPickOtherIssue },
      ]}
    />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontFamily: theme.fonts.mono, marginBottom: 8 },
  input: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.fonts.body,
    marginBottom: 16,
  },
  selectInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectValue: { color: theme.colors.text, fontSize: 14, fontFamily: theme.fonts.body },
  selectPlaceholder: { color: theme.colors.muted, fontSize: 14, fontFamily: theme.fonts.body },
  customTitleInput: { flex: 1, color: theme.colors.text, fontSize: 14, fontFamily: theme.fonts.body, padding: 0 },
  inputError: { borderColor: theme.colors.danger },
  fieldError: { color: theme.colors.danger, fontSize: 11, marginTop: -12, marginBottom: 16, fontFamily: theme.fonts.body },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
  },
  buttonText: { color: theme.colors.ink, fontFamily: theme.fonts.bodySemiBold, fontSize: 14 },
  microcopy: { color: theme.colors.muted, fontSize: 11, textAlign: 'center', marginTop: 10, fontFamily: theme.fonts.body },
  divider: { height: 1, backgroundColor: theme.colors.border, marginTop: 28, marginBottom: 20 },
  historyLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: theme.fonts.mono,
    marginBottom: 12,
  },
  emptyHistory: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyHistoryText: { color: theme.colors.muted, fontSize: 13, fontFamily: theme.fonts.body },
  historyRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  historyTitle: { flex: 1, color: theme.colors.text, fontSize: 14, fontFamily: theme.fonts.bodySemiBold },
  historyStatusText: { fontSize: 10, fontFamily: theme.fonts.mono, textTransform: 'uppercase' },
  historyBody: { color: theme.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: theme.fonts.body },
  historyDate: { color: theme.colors.muted, fontSize: 10, fontFamily: theme.fonts.mono, marginTop: 3 },
});
