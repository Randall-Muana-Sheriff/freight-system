import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../../components/ScreenShell';
import { SectionHeader } from '../../../components/SectionHeader';
import { ActionSheet } from '../../../components/ActionSheet';
import { ToastOverlay } from '../../../components/ToastOverlay';
import { theme } from '../../../lib/theme';
import { useAuth } from '../../../lib/auth';
import * as ImagePicker from 'expo-image-picker';
import { updateOrderStatus, fetchOrderById, confirmDelivery, isNetworkFailure, type OrderDetail } from '../../../lib/api';
import { enqueueOfflineAction, persistDeliveryPhotoForQueue } from '../../../lib/offlineQueue';

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
type Toast = { icon: keyof typeof Ionicons.glyphMap; message: string };

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
        setToast({ icon: 'cloud-offline-outline', message: `Trip #${id} will sync when the connection returns.` });
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Could not update trip status.',
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
          setToast({ icon: 'cloud-offline-outline', message: `Delivery photo for #${id} will upload when the connection returns.` });
        } catch {
          // Persisting/queueing the photo itself failed (e.g. out of
          // storage) — this is the one case with no safe offline path,
          // so say so plainly rather than a generic error.
          setToast({ icon: 'alert-circle-outline', message: 'Could not save the photo for later. Please try again once you have a connection.' });
        }
      } else {
        setToast({
          icon: 'alert-circle-outline',
          message: error instanceof Error ? error.message : 'Could not confirm delivery. Please try again once you have a connection.',
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const onTakeDeliveryPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'camera-outline', message: 'Allow camera access to take a delivery confirmation photo.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    await submitDeliveryPhoto(result.assets[0]);
  };

  const onPickDeliveryPhotoFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ icon: 'images-outline', message: 'Allow photo library access to select a proof-of-delivery picture.' });
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
      <SectionHeader eyebrow="Waybill" title={`Trip #${id}`} subtitle="Update the job state, review route notes, and keep the dispatcher informed." />

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
              <Text style={styles.summaryText}>{order.origin_hub_name || 'Pickup location'}</Text>
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

          {order.recipient_name || order.recipient_phone ? (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.recipientRow}
                activeOpacity={order.recipient_phone ? 0.7 : 1}
                disabled={!order.recipient_phone}
                onPress={() => order.recipient_phone && Linking.openURL(`tel:${order.recipient_phone}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Recipient</Text>
                  <Text style={styles.value}>{order.recipient_name || 'Name not provided'}</Text>
                  {order.recipient_phone ? <Text style={styles.recipientPhone}>{order.recipient_phone}</Text> : null}
                </View>
                {order.recipient_phone ? (
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

      <TouchableOpacity onPress={() => router.back()} style={styles.secondary} activeOpacity={0.8}>
        <Ionicons name="arrow-back-outline" color={theme.colors.primary} size={16} />
        <Text style={styles.secondaryText}>Back to dashboard</Text>
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

    <ToastOverlay message={toast?.message ?? null} icon={toast?.icon ?? 'alert-outline'} onHide={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: theme.fonts.body,
  },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 18 },
  manifestCodeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manifestCode: { color: theme.colors.muted, fontSize: 12, fontFamily: theme.fonts.mono, letterSpacing: 0.6 },
  status: { color: theme.colors.primary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: theme.fonts.mono },
  summaryRow: { flexDirection: 'row', gap: 20, flexWrap: 'wrap', marginTop: 14 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { color: theme.colors.text, fontSize: 12, fontFamily: theme.fonts.bodySemiBold },
  infoBlock: { flex: 1 },
  label: { color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, fontFamily: theme.fonts.mono },
  value: { color: theme.colors.text, marginTop: 6, fontSize: 18, fontFamily: theme.fonts.heading },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recipientPhone: { color: theme.colors.muted, marginTop: 2, fontSize: 13, fontFamily: theme.fonts.mono },
  callBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  timelineText: { color: theme.colors.muted, fontSize: 14, fontFamily: theme.fonts.bodySemiBold },
  timelineTextActive: { color: theme.colors.text },
  timelineSub: { color: theme.colors.muted, fontSize: 11, fontFamily: theme.fonts.body },
  nextStep: { gap: 14 },
  nextStepEyebrow: {
    color: theme.colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: theme.fonts.mono,
  },
  nextStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nextStepTitle: { color: theme.colors.text, fontSize: 16, fontFamily: theme.fonts.bodySemiBold },
  nextStepHelper: { color: theme.colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: theme.fonts.body },
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
  buttonText: { color: theme.colors.ink, fontFamily: theme.fonts.bodySemiBold, fontSize: 13 },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  doneTitle: { color: theme.colors.text, fontSize: 16, fontFamily: theme.fonts.bodySemiBold },
  doneHelper: { color: theme.colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: theme.fonts.body },
  secondary: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  secondaryText: { color: theme.colors.primary, fontSize: 13, fontFamily: theme.fonts.bodySemiBold },
});
