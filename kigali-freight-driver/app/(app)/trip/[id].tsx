import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../../components/ScreenShell';
import { SectionHeader } from '../../../components/SectionHeader';
import { ActionSheet } from '../../../components/ActionSheet';
import { ToastOverlay, type Toast } from '../../../components/ToastOverlay';
import { theme } from '../../../lib/theme';
import { useAuth } from '../../../lib/auth';
import * as ImagePicker from 'expo-image-picker';
import { updateOrderStatus, fetchOrderById, confirmDelivery, isNetworkFailure, type OrderDetail } from '../../../lib/api';
import { enqueueOfflineAction, persistDeliveryPhotoForQueue } from '../../../lib/offlineQueue';
import { isJobInProgress } from '../../../lib/assignments';
import { useUpNavigation } from '../../../lib/navigation';

// How often to re-fetch the order while it's actively in progress, so the
// route-progress bar/ETA below feels alive without needing a socket. Not
// tied to the driver's own telemetry-send interval (~15s, see
// locationTracking.ts) — this just needs to be frequent enough to feel
// current, not to match it exactly.
const ROUTE_PROGRESS_POLL_MS = 25000;

// Maps the real backend status onto the simplified 4-step visual timeline.
const TIMELINE_STEPS = ['Accepted', 'Picked up', 'In transit', 'Delivered'];
// Also doubles as the forward-progression order for deciding which single
// action button is next — a driver can only ever be shown the one status
// ahead of where they currently are, never a status they've already passed.
const STATUS_ORDER = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

function stepIndexForStatus(status?: string): number {
  switch ((status || '').toUpperCase()) {
    case 'ASSIGNED':
      return 0;
    case 'PICKED_UP':
      return 1;
    case 'IN_TRANSIT':
    case 'ARRIVED':
      return 2;
    case 'DELIVERED':
      return 3;
    default:
      return 0;
  }
}

function statusOrderIndex(status?: string): number {
  const index = STATUS_ORDER.indexOf((status || '').toUpperCase());
  return index === -1 ? 0 : index;
}

type ActionStatus = 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';

const ACTION_STEPS: Record<ActionStatus, { icon: keyof typeof Ionicons.glyphMap; label: string; helper: string }> = {
  IN_TRANSIT: {
    icon: 'navigate-outline',
    label: 'Start transit',
    helper: "Let dispatch know you're on the road with this shipment.",
  },
  ARRIVED: {
    icon: 'flag-outline',
    label: 'Mark arrived',
    helper: "Confirm you've reached the delivery point.",
  },
  DELIVERED: {
    icon: 'camera-outline',
    label: 'Confirm delivered',
    helper: 'Take a proof-of-delivery photo to close out this job.',
  },
};

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // A trip is opened from the Jobs list, so that is where both back
  // gestures lead — see the note in lib/navigation.ts for why neither
  // works on its own here.
  const goToJobs = useUpNavigation('/(app)/assignments');
  const { token } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickingDeliverySource, setPickingDeliverySource] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const loadOrder = async () => {
    if (!token || !id) return;
    try {
      const data = await fetchOrderById(token, Number(id));
      setOrder(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load this trip.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  // Polling rather than a socket push: this screen just needs one
  // lightweight query re-run periodically, not a new stream wired into
  // lib/liveEvents.ts's shared alerts socket (see the route-progress plan
  // notes — that connection is scoped specifically to the alerts feed).
  // Only runs while a job is actually in progress; nothing to keep fresh
  // before pickup or after delivery.
  useEffect(() => {
    if (!isJobInProgress(order?.status || '')) return;
    const interval = setInterval(loadOrder, ROUTE_PROGRESS_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, order?.status]);

  const onAction = async (status: string) => {
    if (!token || !id) return;
    setIsUpdating(true);
    setToast(null);
    try {
      await updateOrderStatus(token, Number(id), status);
      loadOrder();
    } catch (error) {
      if (isNetworkFailure(error)) {
        await enqueueOfflineAction({
          type: 'status-update',
          orderId: Number(id),
          status,
          createdAt: new Date().toISOString(),
        });
        setToast({ icon: 'cloud-offline-outline', message: `Trip #${id} will sync when the connection returns.`, tone: 'info' });
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Could not update trip status.',
          tone: 'error',
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Marking a trip DELIVERED requires a proof-of-delivery photo rather than
  // a plain status flip — prompts for camera or library, then uploads. On a
  // network failure, the photo is copied into this app's own persistent
  // storage (see persistDeliveryPhotoForQueue — the original picker-cache
  // location isn't guaranteed to survive until the next sync opportunity)
  // and queued exactly like a status update, so a driver in a signal-dead
  // zone doesn't lose the confirmation just because they tapped it once.
  const submitDeliveryPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!token || !id) return;
    setIsUpdating(true);
    try {
      await confirmDelivery(
        token,
        Number(id),
        { uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType },
        undefined
      );
      loadOrder();
    } catch (error) {
      if (isNetworkFailure(error)) {
        try {
          const fileName = asset.fileName ?? 'delivery-confirmation.jpg';
          const persistedUri = persistDeliveryPhotoForQueue(asset.uri, fileName);
          await enqueueOfflineAction({
            type: 'delivery-photo',
            orderId: Number(id),
            localFileUri: persistedUri,
            fileName,
            mimeType: asset.mimeType || 'image/jpeg',
            createdAt: new Date().toISOString(),
          });
          setToast({ icon: 'cloud-offline-outline', message: `Delivery photo for #${id} will upload when the connection returns.`, tone: 'info' });
        } catch {
          // Persisting/queueing the photo itself failed (e.g. out of
          // storage) — this is the one case with no safe offline path,
          // so say so plainly rather than a generic error.
          setToast({ icon: 'alert-circle-outline', message: 'Could not save the photo for later. Please try again once you have a connection.', tone: 'error' });
        }
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Could not confirm delivery. Please try again once you have a connection.',
          tone: 'error',
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const onTakeDeliveryPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'camera-outline', message: 'Allow camera access to take a delivery confirmation photo.', tone: 'warning' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    await submitDeliveryPhoto(result.assets[0]);
  };

  const onPickDeliveryPhotoFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'images-outline', message: 'Allow photo library access to select a proof-of-delivery picture.', tone: 'warning' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    await submitDeliveryPhoto(result.assets[0]);
  };

  const onChooseDeliverySource = (source: 'camera' | 'library') => {
    setPickingDeliverySource(false);
    if (source === 'camera') {
      onTakeDeliveryPhoto();
    } else {
      onPickDeliveryPhotoFromLibrary();
    }
  };

  // On a dispatcher-entered order the person at the door is the recipient.
  // On a customer-placed one nobody typed a recipient, and the customer is
  // who the driver needs — without this the call button simply vanished on
  // every public order, leaving the driver no number at all.
  const contactName = order?.recipient_name || order?.customer_name || null;
  const contactPhone = order?.recipient_phone || order?.customer_phone || null;
  const contactLabel = order?.recipient_name || order?.recipient_phone ? 'Recipient' : 'Customer';

  const activeStep = stepIndexForStatus(order?.status);
  const currentStatusIndex = statusOrderIndex(order?.status);
  // The one status ahead of where this job actually is right now — once
  // that action is taken, the job's status moves forward and this recomputes
  // to the next one, so a completed step's button can never show again.
  const nextAction = (['IN_TRANSIT', 'ARRIVED', 'DELIVERED'] as ActionStatus[]).find(
    (status) => STATUS_ORDER.indexOf(status) > currentStatusIndex
  );

  return (
    <>
    <ScreenShell>
      <SectionHeader eyebrow="Waybill" title={`Trip #${id}`} />

      {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} /> : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {!loading && order ? (
        <View>
          <View style={styles.manifestCodeRow}>
            <Text style={styles.manifestCode}>KGL-TRIP-{String(id).padStart(4, '0')}</Text>
            <Text style={styles.status}>{(order.status || 'PENDING').replace('_', ' ')}</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="location-outline" size={14} color={theme.colors.accent} />
              {/* Customer orders have no hub — the address they typed is
                  the only pickup there is. Never falls back to the bare
                  word "Pickup location", which reads like information and
                  is not. */}
              <Text style={styles.summaryText}>
                {order.pickup_address_text || order.origin_hub_name || 'Pickup to be confirmed'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="cube-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.summaryText}>{order.weight_kg ? `${order.weight_kg} kg` : 'Weight n/a'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Cargo</Text>
            <Text style={styles.value}>{order.cargo_description || 'Untitled shipment'}</Text>
          </View>

          {order.delivery_address_text ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Deliver to</Text>
                <Text style={styles.value}>{order.delivery_address_text}</Text>
              </View>
            </>
          ) : null}

          {/* The customer wrote this for the driver, not for dispatch —
              access codes, "ask for Claudine at the gate", fragile. It is
              the one field on the screen that changes what they do on
              arrival, so it is called out rather than blended in. */}
          {order.special_instructions ? (
            <>
              <View style={styles.divider} />
              <View style={styles.noteBlock}>
                <Ionicons name="alert-circle-outline" size={15} color={theme.colors.warning} />
                <View style={styles.noteBody}>
                  <Text style={styles.label}>From the customer</Text>
                  <Text style={styles.value}>{order.special_instructions}</Text>
                </View>
              </View>
            </>
          ) : null}

          {contactName || contactPhone ? (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.recipientRow}
                activeOpacity={contactPhone ? 0.7 : 1}
                disabled={!contactPhone}
                onPress={() => contactPhone && Linking.openURL(`tel:${contactPhone}`)}
                accessibilityRole={contactPhone ? 'button' : 'text'}
                accessibilityLabel={
                  contactPhone
                    ? `Call ${contactLabel.toLowerCase()} ${contactName ?? ''} on ${contactPhone}`
                    : `${contactLabel} ${contactName ?? 'not provided'}`
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{contactLabel}</Text>
                  <Text style={styles.value}>{contactName || 'Name not provided'}</Text>
                  {contactPhone ? <Text style={styles.recipientPhone}>{contactPhone}</Text> : null}
                </View>
                {contactPhone ? (
                  <View style={styles.callBadge}>
                    <Ionicons name="call-outline" size={18} color={theme.colors.paper} />
                  </View>
                ) : null}
              </TouchableOpacity>
            </>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.timeline}>
            {TIMELINE_STEPS.map((step, index) => (
              <View key={step} style={styles.timelineRow}>
                <View style={[styles.dot, index < activeStep && styles.dotDone, index === activeStep && styles.dotActive]}>
                  {index < activeStep ? <Ionicons name="checkmark" size={9} color={theme.colors.paper} /> : null}
                </View>
                <View style={styles.timelineLabelWrap}>
                  <Text style={[styles.timelineText, index === activeStep && styles.timelineTextActive]}>{step}</Text>
                  {index === activeStep ? <Text style={styles.timelineSub}>Current job state</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {isJobInProgress(order.status || '') ? (
            <>
              <View style={styles.divider} />
              <View>
                <Text style={styles.label}>Route progress</Text>
                {order.progressPercent != null ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${order.progressPercent}%` }]} />
                    </View>
                    <Text style={styles.progressCaption}>
                      {order.distanceRemainingKm} km remaining · ETA ~{order.etaMinutes} min
                    </Text>
                  </>
                ) : (
                  <Text style={styles.progressCaption}>Waiting for GPS signal…</Text>
                )}
              </View>
            </>
          ) : null}

          <View style={styles.divider} />

          {nextAction ? (
            <View style={styles.nextStep}>
              <Text style={styles.nextStepEyebrow}>Next step</Text>
              <View style={styles.nextStepRow}>
                <Ionicons name={ACTION_STEPS[nextAction].icon} size={20} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.nextStepTitle}>{ACTION_STEPS[nextAction].label}</Text>
                  <Text style={styles.nextStepHelper}>{ACTION_STEPS[nextAction].helper}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setToast(null);
                  if (nextAction === 'DELIVERED') {
                    setPickingDeliverySource(true);
                  } else {
                    onAction(nextAction);
                  }
                }}
                style={[styles.button, nextAction === 'DELIVERED' && styles.buttonDelivered, isUpdating && styles.buttonDisabled]}
                activeOpacity={0.9}
                disabled={isUpdating}
                accessibilityRole="button"
                accessibilityLabel={ACTION_STEPS[nextAction].label}
                accessibilityHint={ACTION_STEPS[nextAction].helper}
                // While updating the label is replaced by a spinner, which
                // announces as nothing at all without an explicit busy state.
                accessibilityState={{ disabled: isUpdating, busy: isUpdating }}
              >
                {isUpdating ? (
                  <ActivityIndicator color={theme.colors.paper} size="small" />
                ) : (
                  <>
                    <Ionicons name={ACTION_STEPS[nextAction].icon} size={16} color={theme.colors.paper} />
                    <Text style={styles.buttonText}>{ACTION_STEPS[nextAction].label}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Delivery confirmed</Text>
                <Text style={styles.doneHelper}>This job is closed out. Photo proof is saved to your delivery history.</Text>
              </View>
            </View>
          )}
        </View>
      ) : null}

      <TouchableOpacity onPress={goToJobs} style={styles.secondary} activeOpacity={0.8}>
        <Ionicons name="arrow-back-outline" color={theme.colors.primary} size={16} />
        {/* Named for where it actually goes. It said "dashboard" while
            calling router.back(), so on the one occasion the label was
            accurate would have been the one where the button did nothing. */}
        <Text style={styles.secondaryText}>Back to jobs</Text>
      </TouchableOpacity>
    </ScreenShell>

    <ActionSheet
      visible={pickingDeliverySource}
      title="Confirm delivery"
      message="Take a proof-of-delivery photo or choose an existing one."
      onCancel={() => setPickingDeliverySource(false)}
      options={[
        { key: 'camera', label: 'Take Photo', icon: 'camera-outline', onPress: () => onChooseDeliverySource('camera') },
        { key: 'library', label: 'Choose from Library', icon: 'images-outline', onPress: () => onChooseDeliverySource('library') },
      ]}
    />

    <ToastOverlay toast={toast} onHide={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: theme.colors.danger,
    ...theme.type.bodySm,
    marginBottom: 12,
    fontFamily: theme.fonts.body,
  },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 18 },
  manifestCodeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manifestCode: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.mono, letterSpacing: 0.6 },
  status: { color: theme.colors.primary, ...theme.type.micro, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: theme.fonts.mono },
  summaryRow: { flexDirection: 'row', gap: 20, flexWrap: 'wrap', marginTop: 14 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { color: theme.colors.text, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  infoBlock: { flex: 1 },
  label: { color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, ...theme.type.micro, fontFamily: theme.fonts.mono },
  value: { color: theme.colors.text, marginTop: 6, ...theme.type.title, fontFamily: theme.fonts.headingBlack },
  noteBlock: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteBody: { flex: 1 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recipientPhone: { color: theme.colors.muted, marginTop: 2, ...theme.type.bodySm, fontFamily: theme.fonts.mono },
  callBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    // surface2 sits too close to the card behind it for the unfilled
    // portion to read as a track at all, which left the fill percentage
    // impossible to judge at a glance — the caption underneath was doing
    // all the work. A translucent light overlay separates from any
    // surface it is placed on.
    backgroundColor: 'rgba(241, 239, 232, 0.12)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    // Keeps a sliver visible at very low percentages, so "just started"
    // still looks different from "no data".
    minWidth: 4,
  },
  progressCaption: { color: theme.colors.muted, ...theme.type.label, marginTop: 8, fontFamily: theme.fonts.mono },
  timeline: { gap: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  dotActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  timelineLabelWrap: { gap: 2 },
  timelineText: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  timelineTextActive: { color: theme.colors.text },
  timelineSub: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.body },
  nextStep: { gap: 14 },
  nextStepEyebrow: {
    color: theme.colors.muted,
    ...theme.type.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: theme.fonts.mono,
  },
  nextStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nextStepTitle: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.bodySemiBold },
  nextStepHelper: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 3, fontFamily: theme.fonts.body },
  button: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  buttonDelivered: { backgroundColor: theme.colors.success },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.ink, fontFamily: theme.fonts.bodySemiBold, ...theme.type.bodySm },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  doneTitle: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.bodySemiBold },
  doneHelper: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 3, fontFamily: theme.fonts.body },
  secondary: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  secondaryText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
