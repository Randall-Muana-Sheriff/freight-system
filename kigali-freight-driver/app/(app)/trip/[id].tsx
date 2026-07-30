import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../../components/ScreenShell';
import { SectionHeader } from '../../../components/SectionHeader';
import { theme } from '../../../lib/theme';
import { useAuth } from '../../../lib/auth';
import * as ImagePicker from 'expo-image-picker';
import { updateOrderStatus, fetchOrderById, confirmDelivery, isNetworkFailure, type OrderDetail } from '../../../lib/api';
import { enqueueOfflineAction } from '../../../lib/offlineQueue';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Maps the real backend status onto the simplified 4-step visual timeline.
const TIMELINE_STEPS = ['Accepted', 'Picked up', 'In transit', 'Delivered'];
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

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    try {
      await updateOrderStatus(token, Number(id), status);
      Alert.alert('Status updated', `Trip #${id} marked as ${status}.`);
      loadOrder();
    } catch (error) {
      if (isNetworkFailure(error)) {
        await enqueueOfflineAction({
          type: 'status-update',
          orderId: Number(id),
          status,
          createdAt: new Date().toISOString(),
        });
        Alert.alert('Saved offline', `Trip #${id} will sync when the connection returns.`);
      } else {
        Alert.alert('Update failed', error instanceof Error ? error.message : 'Could not update trip status.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Marking a trip DELIVERED requires a proof-of-delivery photo rather than
  // a plain status flip — prompts for camera or library, then uploads.
  // Not offline-queueable like the other statuses: the photo file itself
  // would need to survive being queued, which the current offline queue
  // (designed for small JSON payloads) doesn't support yet.
  const onConfirmDelivery = async () => {
    if (!token || !id) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to take a delivery confirmation photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUpdating(true);
    try {
      await confirmDelivery(
        token,
        Number(id),
        { uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType },
        undefined
      );
      Alert.alert('Delivery confirmed', `Trip #${id} marked as delivered with photo proof.`);
      loadOrder();
    } catch (error) {
      Alert.alert(
        'Confirmation failed',
        error instanceof Error ? error.message : 'Could not confirm delivery. Please try again once you have a connection.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const activeStep = stepIndexForStatus(order?.status);

  return (
    <ScreenShell>
      <SectionHeader eyebrow="Waybill" title={`Trip #${id}`} subtitle="Update the job state, review route notes, and keep the dispatcher informed." />

      {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} /> : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {!loading && order ? (
        <View style={styles.panel}>
          <View style={styles.panelTopBar} />
          <View style={styles.manifestCodeRow}>
            <Text style={styles.manifestCode}>KGL-TRIP-{String(id).padStart(4, '0')}</Text>
            <Text style={styles.status}>{(order.status || 'PENDING').replace('_', ' ')}</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Ionicons name="location-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.summaryText}>{order.origin_hub_name || 'Pickup location'}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Ionicons name="cube-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.summaryText}>{order.weight_kg ? `${order.weight_kg} kg` : 'Weight n/a'}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Cargo</Text>
              <Text style={styles.value}>{order.cargo_description || 'Untitled shipment'}</Text>
            </View>
          </View>

          {order.recipient_name || order.recipient_phone ? (
            <TouchableOpacity
              style={styles.recipientBlock}
              activeOpacity={order.recipient_phone ? 0.8 : 1}
              disabled={!order.recipient_phone}
              onPress={() => order.recipient_phone && Linking.openURL(`tel:${order.recipient_phone}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Recipient</Text>
                <Text style={styles.value}>{order.recipient_name || 'Name not provided'}</Text>
                {order.recipient_phone ? <Text style={styles.recipientPhone}>{order.recipient_phone}</Text> : null}
              </View>
              {order.recipient_phone ? <Ionicons name="call-outline" size={20} color={theme.colors.primary} /> : null}
            </TouchableOpacity>
          ) : null}

          <View style={styles.timeline}>
            {TIMELINE_STEPS.map((step, index) => (
              <View key={step} style={styles.timelineRow}>
                <View style={[styles.dot, index <= activeStep && styles.dotActive]} />
                <View style={styles.timelineLabelWrap}>
                  <Text style={styles.timelineText}>{step}</Text>
                  {index === activeStep ? <Text style={styles.timelineSub}>Current job state</Text> : null}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.buttonRow}>
            {['IN_TRANSIT', 'ARRIVED', 'DELIVERED'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => (status === 'DELIVERED' ? onConfirmDelivery() : onAction(status))}
                style={[styles.button, status === 'DELIVERED' && styles.buttonDelivered]}
                activeOpacity={0.9}
                disabled={isUpdating}
              >
                {status === 'DELIVERED' ? <Ionicons name="camera-outline" size={16} color={theme.colors.paper} /> : null}
                <Text style={styles.buttonText}>
                  {status === 'DELIVERED' ? 'Confirm delivered' : status.toLowerCase().replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <TouchableOpacity onPress={() => router.back()} style={styles.secondary} activeOpacity={0.8}>
        <Ionicons name="arrow-back-outline" color={theme.colors.primary} size={16} />
        <Text style={styles.secondaryText}>Back to dashboard</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  panel: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 18,
    gap: 18,
    overflow: 'hidden',
  },
  panelTopBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: theme.colors.primary },
  manifestCodeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  manifestCode: { color: theme.colors.muted, fontSize: 12, fontFamily: mono, letterSpacing: 0.6 },
  status: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: mono },
  summaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  infoBlock: { flex: 1 },
  label: { color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, fontFamily: mono },
  value: { color: theme.colors.text, marginTop: 6, fontSize: 18, fontWeight: '800' },
  recipientBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recipientPhone: { color: theme.colors.muted, marginTop: 2, fontSize: 13, fontFamily: mono },
  timeline: { gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, borderStyle: 'dashed' },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  dotActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  timelineLabelWrap: { gap: 2 },
  timelineText: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  timelineSub: { color: theme.colors.muted, fontSize: 11 },
  buttonRow: { gap: 10 },
  button: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  buttonDelivered: { backgroundColor: theme.colors.success },
  buttonText: { color: theme.colors.paper, fontWeight: '900', textTransform: 'capitalize', fontSize: 13 },
  secondary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  secondaryText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
});
