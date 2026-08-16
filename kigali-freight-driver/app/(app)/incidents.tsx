import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { ToastOverlay, type Toast } from '../../components/ToastOverlay';
import { ActionSheet } from '../../components/ActionSheet';
import { SafetyChecklistCard } from '../../components/SafetyChecklistCard';
import { theme } from '../../lib/theme';
import {
  reportIncident,
  isNetworkFailure,
  fetchMyIncidents,
  fetchDriverAssignments,
  type MyIncident,
  type IncidentReportResult,
  type DriverAssignment,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { enqueueOfflineAction, persistIncidentPhotoForQueue } from '../../lib/offlineQueue';

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

// Display-only — the backend independently re-derives this from the
// verified order it looks up server-side (see stagePhraseForStatus in
// incidentController.js), so a mismatch here is never a security issue,
// just cosmetic. Kept in sync in wording, not in trust.
function stagePhrase(status: string) {
  switch (status.toUpperCase()) {
    case 'ASSIGNED':
      return 'heading to pick up';
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 'in transit with';
    case 'ARRIVED':
      return 'heading to deliver';
    default:
      return null;
  }
}

function formatReportDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// A "high" severity result gets distinctly different framing (matches
// what the AI is actually flagging) plus nearest-hub guidance whenever
// it's available — the immediate, real-time payoff of this feature, not
// something a driver has to wait for a dispatcher to relay back.
function buildSuccessToast(result: IncidentReportResult): Toast {
  // The nearest-hub distance is supplementary guidance, not the pass/fail
  // verdict on the report itself — kept as a separate `note` (rendered in
  // its own neutral color/row by ToastOverlay) rather than folded into the
  // main sentence, so it reads as "here's some extra help" and not as
  // part of whether the report succeeded.
  const note = result.nearestHub ? `Nearest hub: ${result.nearestHub.name} (${result.nearestHub.distanceKm}km)` : undefined;
  if (result.severity === 'high') {
    // The report still sent successfully — "warning" here means "this is
    // urgent, pay attention," not "something went wrong."
    return { icon: 'alert-circle', message: 'Report sent — marked urgent, dispatch has been alerted.', tone: 'warning', note };
  }
  return { icon: 'checkmark-circle-outline', message: 'Report sent — dispatch has been notified.', tone: 'success', note };
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
  // Photo-first: a driver can attach a photo and send with little or no
  // typing — the backend drafts a title/description from it. Title and
  // description are no longer hard-required on their own, only "at least
  // one of {description, photo}" is — see onSubmit.
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pickingPhotoSource, setPickingPhotoSource] = useState(false);
  // Reporting is never blocked without an active job — a driver with
  // nothing assigned right now can still always reach dispatch. This is
  // purely additive: when there IS an active assignment, attach which one
  // and what stage it's at, so the report reads as "in transit with the
  // rice bags order" instead of floating with no context. Auto-selected
  // when there's exactly one; a driver can always pick a different one
  // (or none, via "Unrelated to a job") if more than one, or clear it.
  const [activeAssignments, setActiveAssignments] = useState<DriverAssignment[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [pickingAssignment, setPickingAssignment] = useState(false);

  const descriptionMissing = showErrors && !description.trim() && !photo;
  const selectedAssignment = activeAssignments.find((a) => a.id === selectedOrderId) || null;

  const loadActiveAssignments = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await fetchDriverAssignments(token);
      setActiveAssignments(rows);
      setSelectedOrderId((current) => {
        if (current && rows.some((r) => r.id === current)) return current;
        return rows.length === 1 ? rows[0].id : null;
      });
    } catch {
      // Best-effort — reporting must never depend on this succeeding, it
      // only adds optional context when it's available.
    }
  }, [token]);

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
      loadActiveAssignments();
    }, [loadIncidents, loadActiveAssignments])
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

  const onTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'camera-outline', message: 'Allow camera access to attach a photo.', tone: 'warning' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    setPhoto(result.assets[0]);
    setToast(null);
  };

  const onPickPhotoFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'images-outline', message: 'Allow photo library access to attach a photo.', tone: 'warning' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    setPhoto(result.assets[0]);
    setToast(null);
  };

  const onChoosePhotoSource = (source: 'camera' | 'library') => {
    setPickingPhotoSource(false);
    if (source === 'camera') {
      onTakePhoto();
    } else {
      onPickPhotoFromLibrary();
    }
  };

  // Best-effort only — a safety report must never be blocked by a
  // location permission prompt or a slow GPS fix. Returns null on
  // anything short of a clean, already-granted read, and the backend
  // treats missing coordinates as "no nearest-hub guidance", not an error.
  const getBestEffortLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return null;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      return null;
    }
  };

  const onSubmit = async () => {
    if (!token) return;
    if (!description.trim() && !photo) {
      setShowErrors(true);
      setToast({ icon: 'alert-circle-outline', message: 'Add a few details or attach a photo before sending.', tone: 'warning' });
      return;
    }

    setSending(true);
    setToast(null);
    // Best-effort, never blocks — see getBestEffortLocation.
    const location = await getBestEffortLocation();
    const trimmedTitle = title.trim() || undefined;
    const trimmedDescription = description.trim() || undefined;

    try {
      const result = await reportIncident(token, {
        orderId: selectedOrderId ?? undefined,
        title: trimmedTitle,
        description: trimmedDescription,
        lat: location?.lat,
        lng: location?.lng,
        photo: photo ? { uri: photo.uri, fileName: photo.fileName ?? undefined, mimeType: photo.mimeType } : undefined,
      });
      setTitle('');
      setIsCustomTitle(false);
      setDescription('');
      setPhoto(null);
      setShowErrors(false);
      setToast(buildSuccessToast(result));
      loadIncidents();
    } catch (error) {
      if (isNetworkFailure(error)) {
        const localPhotoUri = photo ? persistIncidentPhotoForQueue(photo.uri, photo.fileName || 'incident-photo.jpg') : undefined;
        await enqueueOfflineAction({
          type: 'incident-report',
          payload: { orderId: selectedOrderId ?? undefined, title: trimmedTitle, description: trimmedDescription, lat: location?.lat, lng: location?.lng },
          localPhotoUri,
          photoFileName: photo?.fileName ?? undefined,
          photoMimeType: photo?.mimeType,
          createdAt: new Date().toISOString(),
        });
        setTitle('');
        setIsCustomTitle(false);
        setDescription('');
        setPhoto(null);
        setShowErrors(false);
        setToast({ icon: 'cloud-offline-outline', message: "Saved offline — it'll send as soon as you're back in range.", tone: 'info' });
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Failed to send incident report.',
          tone: 'error',
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

      <SafetyChecklistCard />

      {activeAssignments.length > 0 && (
        <TouchableOpacity style={styles.assignmentChip} activeOpacity={0.8} onPress={() => setPickingAssignment(true)}>
          <Ionicons name="cube-outline" size={16} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            {selectedAssignment ? (
              <>
                <Text style={styles.assignmentChipTitle} numberOfLines={1}>
                  Reporting about: {selectedAssignment.cargo_description || `Order #${selectedAssignment.id}`}
                </Text>
                <Text style={styles.assignmentChipDetail}>{stagePhrase(selectedAssignment.status || '') || 'Assigned'}</Text>
              </>
            ) : (
              <Text style={styles.assignmentChipTitle}>Not linked to a specific job</Text>
            )}
          </View>
          <Text style={styles.assignmentChipChange}>Change</Text>
        </TouchableOpacity>
      )}

      {/* First in the form, not last. A driver at the roadside can raise
          a usable report by pointing the camera and sending — the fields
          below are all optional once there is a photo. It sat underneath
          them for a while, which buried the fastest path behind two
          keyboards. */}
      <Text style={styles.label}>Photo (optional)</Text>
      {photo ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.photoRemoveButton} activeOpacity={0.85} onPress={() => setPhoto(null)}>
            <Ionicons name="close" size={16} color={theme.colors.paper} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.photoAttachButton}
          activeOpacity={0.8}
          onPress={() => {
            setToast(null);
            setPickingPhotoSource(true);
          }}
        >
          <Ionicons name="camera-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.photoAttachText}>Attach a photo — we&apos;ll help draft the report</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Incident title (optional)</Text>
      {isCustomTitle ? (
        <View style={[styles.input, styles.selectInput]}>
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
        <TouchableOpacity style={[styles.input, styles.selectInput]} activeOpacity={0.8} onPress={() => setPickingIssue(true)}>
          <Text style={title ? styles.selectValue : styles.selectPlaceholder}>{title || 'Select an issue'}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Details (optional if you attach a photo)</Text>
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
      {descriptionMissing ? <Text style={styles.fieldError}>Add a few details or attach a photo below.</Text> : null}

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
                  {item.severity === 'high' ? (
                    <View style={styles.severityBadge}>
                      <Ionicons name="alert-circle" size={10} color={theme.colors.danger} />
                      <Text style={styles.severityBadgeText}>Marked urgent</Text>
                    </View>
                  ) : null}
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

    <ToastOverlay toast={toast} onHide={() => setToast(null)} />

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

    <ActionSheet
      visible={pickingAssignment}
      title="Which job is this about?"
      onCancel={() => setPickingAssignment(false)}
      options={[
        ...activeAssignments.map((a) => ({
          key: String(a.id),
          label: a.cargo_description || `Order #${a.id}`,
          icon: 'cube-outline' as const,
          onPress: () => {
            setSelectedOrderId(a.id);
            setPickingAssignment(false);
          },
        })),
        {
          key: 'none',
          label: 'Unrelated to a job',
          icon: 'close-circle-outline' as const,
          onPress: () => {
            setSelectedOrderId(null);
            setPickingAssignment(false);
          },
        },
      ]}
    />

    <ActionSheet
      visible={pickingPhotoSource}
      title="Attach a photo"
      onCancel={() => setPickingPhotoSource(false)}
      options={[
        { key: 'camera', label: 'Take photo', icon: 'camera-outline' as const, onPress: () => onChoosePhotoSource('camera') },
        { key: 'library', label: 'Choose from library', icon: 'images-outline' as const, onPress: () => onChoosePhotoSource('library') },
      ]}
    />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.colors.muted, ...theme.type.micro, textTransform: 'uppercase', letterSpacing: 1, fontFamily: theme.fonts.mono, marginBottom: 8 },
  input: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    color: theme.colors.text,
    ...theme.type.bodySm,
    fontFamily: theme.fonts.body,
    marginBottom: 16,
  },
  selectInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectValue: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  selectPlaceholder: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  customTitleInput: { flex: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.body, padding: 0 },
  inputError: { borderColor: theme.colors.danger },
  fieldError: { color: theme.colors.danger, ...theme.type.micro, marginTop: -12, marginBottom: 16, fontFamily: theme.fonts.body },
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
  buttonText: { color: theme.colors.ink, fontFamily: theme.fonts.bodySemiBold, ...theme.type.bodySm },
  microcopy: { color: theme.colors.muted, ...theme.type.micro, textAlign: 'center', marginTop: 10, fontFamily: theme.fonts.body },
  divider: { height: 1, backgroundColor: theme.colors.border, marginTop: 28, marginBottom: 20 },
  historyLabel: {
    color: theme.colors.muted,
    ...theme.type.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: theme.fonts.mono,
    marginBottom: 12,
  },
  emptyHistory: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyHistoryText: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  historyRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  historyTitle: { flex: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  historyStatusText: { ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase' },
  historyBody: { color: theme.colors.muted, ...theme.type.label, lineHeight: 17, marginTop: 2, fontFamily: theme.fonts.body },
  historyDate: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono, marginTop: 3 },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: `${theme.colors.danger}1A`,
  },
  severityBadgeText: { color: theme.colors.danger, ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.5 },
  assignmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: theme.radius.md,
    backgroundColor: `${theme.colors.primary}14`,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}40`,
    padding: 12,
    marginBottom: 16,
  },
  assignmentChipTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  assignmentChipDetail: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.body, marginTop: 1, textTransform: 'capitalize' },
  assignmentChipChange: { color: theme.colors.primary, ...theme.type.micro, fontFamily: theme.fonts.bodySemiBold },
  photoAttachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    padding: 13,
    marginBottom: 16,
  },
  photoAttachText: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body, flex: 1 },
  photoPreviewWrap: { marginBottom: 16, borderRadius: theme.radius.md, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 180, backgroundColor: theme.colors.surface2 },
  photoRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
