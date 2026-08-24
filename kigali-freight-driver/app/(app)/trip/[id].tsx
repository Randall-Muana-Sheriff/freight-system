import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View , TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../../components/ScreenShell';
import { SectionHeader } from '../../../components/SectionHeader';
import { ActionSheet } from '../../../components/ActionSheet';
import { ToastOverlay, type Toast } from '../../../components/ToastOverlay';
import { CollectPaymentCard } from '../../../components/CollectPaymentCard';
import { theme } from '../../../lib/theme';
import { useAuth } from '../../../lib/auth';
import * as ImagePicker from 'expo-image-picker';
import { updateOrderStatus, fetchOrderById, confirmDelivery, confirmDeliveryByCode, acceptJobOffer, declineJobOffer, isNetworkFailure, type OrderDetail } from '../../../lib/api';
import { enqueueOfflineAction, persistDeliveryPhotoForQueue } from '../../../lib/offlineQueue';
import { isRetryableFailure } from '../../../lib/retryable';
import {
  TIMELINE_STEPS,
  stepIndexForStatus,
  nextActionForStatus,
  isCancelled as statusIsCancelled,
  isOffer as statusIsOffer,
  type ActionStatus,
} from '../../../lib/tripProgress';
import { isJobInProgress } from '../../../lib/assignments';
import { useUpNavigation } from '../../../lib/navigation';
import { captureException } from '../../../lib/crashReporting';

// How often to re-fetch the order while it's actively in progress, so the
// route-progress bar/ETA below feels alive without needing a socket. Not
// tied to the driver's own telemetry-send interval (~15s, see
// locationTracking.ts) — this just needs to be frequent enough to feel
// current, not to match it exactly.
const ROUTE_PROGRESS_POLL_MS = 25000;



const ACTION_STEPS: Record<ActionStatus, { icon: keyof typeof Ionicons.glyphMap; label: string; helper: string }> = {
  // The button that makes waiting at a pickup payable. Nothing else in the
  // app can produce this event, and without it the wait at that end is
  // indistinguishable from the drive there -- so a driver held two hours at a
  // warehouse gate simply was not paid for it.
  AT_PICKUP: {
    icon: 'time-outline',
    label: "I'm at the pickup",
    helper: 'Tap when you arrive, so waiting to be loaded is paid for.',
  },
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
  const [answeringOffer, setAnsweringOffer] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [codeEntryOpen, setCodeEntryOpen] = useState(false);
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
      // Queue anything that could still succeed later, not only a dropped
      // connection. This gate used to be a string match on the error message,
      // so a 500 fell through to an error toast and the driver's work was
      // simply lost — while retryable.ts, which decides whether the queue
      // *keeps* an item, called a 500 worth another go. The same question
      // asked at either end of the pipe should get the same answer.
      if (isRetryableFailure(error)) {
        await enqueueOfflineAction({
          type: 'status-update',
          orderId: Number(id),
          status,
          createdAt: new Date().toISOString(),
        });
        // Advance the job locally, now, without waiting for a server that we
        // have just established we cannot reach.
        //
        // This is where the duplicate status updates were manufactured. The
        // queue accepted the action but the screen did not move: same step
        // highlighted, same live button, so the driver — reasonably — tapped
        // it again, and again, each tap appending another copy. Every copy
        // after the first is refused once the queue drains, and until the
        // refusals were handled that jammed the queue in front of the
        // delivery photos. Fixing it here is the fix at source; everything
        // downstream is containment.
        setOrder((prev) => (prev ? { ...prev, status } : prev));
        setToast({
          icon: 'cloud-offline-outline',
          // A 5xx is not being offline, and telling a driver with four bars
          // to wait for a connection sends them looking for a fault that is
          // not theirs.
          message: isNetworkFailure(error)
            ? `Trip #${id} will sync when the connection returns.`
            : `Dispatch could not take that just now. Trip #${id} is saved and will retry.`,
          tone: 'info',
        });
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

  // Closing a delivery on the code the recipient was texted, with no photo.
  //
  // A photo shows a parcel somewhere; a code the recipient read off their own
  // phone shows it reached the person it was addressed to. It is also the only
  // proof available to a driver whose phone has no usable camera, which is not
  // a rare case in a country where about a third of people own a smartphone.
  //
  // Not queued offline like the photo path. A code is checked against a hash
  // on the server with a capped number of attempts, so it cannot be verified
  // on the phone -- queuing it would mean telling a driver a delivery was
  // confirmed and then discovering at sync that the code was wrong, with the
  // recipient long gone.
  const submitDeliveryCode = async () => {
    if (!token || !id) return;
    const entered = deliveryCode.replace(/\D/g, '');
    if (!entered) return;
    setIsUpdating(true);
    try {
      await confirmDeliveryByCode(token, Number(id), entered);
      setDeliveryCode('');
      setCodeEntryOpen(false);
      loadOrder();
    } catch (error) {
      setToast({
        icon: 'alert-circle-outline',
        message: error instanceof Error ? error.message : 'That code could not be checked.',
        tone: 'error',
      });
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
      if (isRetryableFailure(error)) {
        try {
          const fileName = asset.fileName ?? 'delivery-confirmation.jpg';
          const persistedUri = await persistDeliveryPhotoForQueue(asset.uri, fileName);
          await enqueueOfflineAction({
            type: 'delivery-photo',
            orderId: Number(id),
            localFileUri: persistedUri,
            fileName,
            mimeType: asset.mimeType || 'image/jpeg',
            createdAt: new Date().toISOString(),
          });
          // Same reason as the status branch: without this the job still
          // shows "Confirm delivered" and the driver photographs the load a
          // second time.
          setOrder((prev) => (prev ? { ...prev, status: 'DELIVERED' } : prev));
          setToast({
            icon: 'cloud-offline-outline',
            message: isNetworkFailure(error)
              ? `Delivery photo for #${id} will upload when the connection returns.`
              : `Dispatch could not take that just now. The photo for #${id} is saved and will retry.`,
            tone: 'info',
          });
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
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setToast({ icon: 'camera-outline', message: 'Allow camera access to take a delivery confirmation photo.', tone: 'warning' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;
      await submitDeliveryPhoto(result.assets[0]);
    } catch (err) {
      captureException(err, { screen: 'trip', action: 'onTakeDeliveryPhoto' });
      setToast({
        icon: 'alert-circle-outline',
        tone: 'error',
        message: 'Could not open the camera. Try again. The delivery is not confirmed yet.',
      });
    }
  };

  const onPickDeliveryPhotoFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setToast({ icon: 'images-outline', message: 'Allow photo library access to select a proof-of-delivery picture.', tone: 'warning' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;
      await submitDeliveryPhoto(result.assets[0]);
    } catch (err) {
      captureException(err, { screen: 'trip', action: 'onPickDeliveryPhotoFromLibrary' });
      setToast({
        icon: 'alert-circle-outline',
        tone: 'error',
        message: 'Could not open your photo library. Try again. The delivery is not confirmed yet.',
      });
    }
  };

  const onChooseDeliverySource = (source: 'camera' | 'library') => {
    setPickingDeliverySource(false);
    if (source === 'camera') {
      void onTakeDeliveryPhoto();
    } else {
      void onPickDeliveryPhotoFromLibrary();
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
  // The one status ahead of where this job actually is right now — once
  // that action is taken, the job's status moves forward and this recomputes
  // to the next one, so a completed step's button can never show again.
  // AT_PICKUP leads, so a driver sitting at a gate can say so before they
  // have anything to transit with. PICKED_UP is deliberately not here: this
  // app has never sent it, and adding a step nobody asked for to a flow
  // drivers already know is a worse trade than leaving one status unused.
  const isOffer = statusIsOffer(order?.status);
  // A job that has been called off. It used to render as a brand new one —
  // both progress helpers answered "step zero" for any status they did not
  // recognise — so a cancelled order showed a lit first dot and a live
  // "I'm at the pickup" button. Tapping it sent an update the server refuses.
  const isCancelled = statusIsCancelled(order?.status);

  const answerOffer = async (accept: boolean) => {
    if (!order || !token) return;
    setAnsweringOffer(true);
    try {
      if (accept) {
        await acceptJobOffer(token, order.id);
      } else {
        await declineJobOffer(token, order.id);
      }
      goToJobs();
    } catch (error) {
      setToast({
        icon: 'alert-circle-outline',
        message: error instanceof Error ? error.message : 'Could not answer that offer.',
        tone: 'error',
      });
    } finally {
      setAnsweringOffer(false);
    }
  };

  const nextAction = nextActionForStatus(order?.status);

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

          {/* The driver's own share, and only that. What the customer paid
              and what the platform kept are not on this endpoint and are
              not a driver's business -- what they need is the figure that
              lands with them, which this already is: net of the fee and
              covering the run's fuel. Said again here rather than only on
              the list card, because this is the screen open while the work
              is actually being done. */}
          {order.driver_net != null ? (
            <View style={styles.infoBlock}>
              <Text style={styles.label}>You earn</Text>
              <Text style={styles.payValue}>
                {order.price_is_estimate ? 'About ' : ''}
                {Number(order.driver_net).toLocaleString()} RWF
              </Text>
              {order.price_is_estimate ? (
                <Text style={styles.payNote}>
                  Confirmed once dispatch sets the pickup and drop-off points.
                </Text>
              ) : null}
              {/* Already inside the figure above. Named because a number that
                  went up after the job closed should say why -- otherwise the
                  driver is left working out whether they were paid for the
                  hour they spent at the gate. */}
              {Number(order.detention_amount) > 0 ? (
                <Text style={styles.payNote}>
                  Includes {Number(order.detention_amount).toLocaleString()} RWF for waiting.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Blocks on this screen are separated by an explicit divider
              rather than by margins, so one inserted without a trailing
              divider sits flush against whatever follows it. */}
          {order.driver_net != null ? <View style={styles.divider} /> : null}

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

          {/* A cancelled job gets a sentence, not a ladder and a button.
              Hiding the controls is the correction; saying why is the part
              the driver actually needs, because otherwise a job simply
              loses its button and looks broken. */}
          {isCancelled ? (
            <>
              <View style={styles.divider} />
              <View style={styles.cancelledNotice}>
                <View style={[styles.noticeRail, { backgroundColor: theme.colors.danger }]} />
                <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cancelledTitle}>This job was cancelled</Text>
                  <Text style={styles.cancelledDetail}>
                    There is nothing more to do on it. Call dispatch if you were already on your way.
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {/* No ladder on a job that is not theirs, or one that is over. Both
              statuses used to fall through the progress helpers to step zero,
              so an offer rendered "Accepted — current job state" above a
              button asking whether to accept, and a cancelled job rendered as
              a fresh one. Neither has any progress to show. */}
          {isOffer || isCancelled ? null : (
          <>
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
          </>
          )}

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

          {/* An offer, before it is anything else. The ordinary controls are
              hidden while this is up: "start transit" on a job the driver has
              not taken is an accept button wearing the wrong label, and the
              one decision in front of them is whether to take it at all. The
              pay is repeated here because that is what the decision is made
              on. */}
          {/* Above the delivery button on purpose. The fare is taken at the
              door and the server will not record a payment once the job is
              closed, so a driver who confirms delivery first can no longer
              collect. Putting this in front of that button is the only
              protection the app can offer against an order of operations
              nobody warned them about. */}
          {isCancelled || isOffer ? null : (
            <CollectPaymentCard order={order} token={token ?? ''} onSettled={loadOrder} />
          )}

          {isCancelled ? null : isOffer ? (
            <View style={styles.nextStep}>
              <Text style={styles.nextStepEyebrow}>Offered to you</Text>
              <Text style={styles.offerPrompt}>
                {order.driver_net != null
                  ? `${Number(order.driver_net).toLocaleString()} RWF to you. Take this job?`
                  : 'Take this job?'}
              </Text>
              <View style={styles.offerRow}>
                <TouchableOpacity
                  style={[styles.offerButton, styles.offerDecline]}
                  onPress={() => void answerOffer(false)}
                  disabled={answeringOffer}
                  accessibilityRole="button"
                >
                  <Text style={styles.offerDeclineText}>No thanks</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.offerButton, styles.offerAccept]}
                  onPress={() => void answerOffer(true)}
                  disabled={answeringOffer}
                  accessibilityRole="button"
                >
                  {answeringOffer ? (
                    <ActivityIndicator color={theme.colors.ink} size="small" />
                  ) : (
                    <Text style={styles.offerAcceptText}>Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : nextAction ? (
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

              {/* The other way to close a delivery. Offered only at the last
                  step, and only when a code was actually issued -- suggesting
                  one that was never sent would send a driver hunting for a
                  number the recipient does not have. Quieter than the photo
                  button because the photo is still the common path; this is
                  the way out when the camera is not an option. */}
              {nextAction === 'DELIVERED' && order.delivery_code_sent_at ? (
                codeEntryOpen ? (
                  <View style={styles.codeBlock}>
                    <Text style={styles.codeLabel}>Code from the recipient</Text>
                    <TextInput
                      style={styles.codeInput}
                      value={deliveryCode}
                      onChangeText={setDeliveryCode}
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholder="0000"
                      placeholderTextColor={theme.colors.muted}
                      autoFocus
                      accessibilityLabel="Delivery code from the recipient"
                    />
                    <Text style={styles.codeHelper}>
                      They were texted a four-digit code when you set off. Ask them to read it out.
                    </Text>
                    <View style={styles.codeRow}>
                      <TouchableOpacity
                        style={[styles.codeButton, styles.codeCancel]}
                        onPress={() => { setCodeEntryOpen(false); setDeliveryCode(''); }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.codeCancelText}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.codeButton, styles.codeConfirm, (!deliveryCode || isUpdating) && styles.buttonDisabled]}
                        onPress={() => void submitDeliveryCode()}
                        disabled={!deliveryCode || isUpdating}
                        accessibilityRole="button"
                      >
                        <Text style={styles.codeConfirmText}>Confirm with code</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setCodeEntryOpen(true)} accessibilityRole="button">
                    <Text style={styles.codeLink}>No camera? Use the recipient's code instead</Text>
                  </TouchableOpacity>
                )
              ) : null}
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
  cancelledNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  noticeRail: { width: 3, height: 28, borderRadius: 2 },
  cancelledTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  cancelledDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 2, fontFamily: theme.fonts.body },
  errorText: {
    color: theme.colors.danger,
    ...theme.type.bodySm,
    marginBottom: 12,
    fontFamily: theme.fonts.body,
  },
  codeBlock: { marginTop: 14, gap: 8 },
  codeLabel: { color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, ...theme.type.micro, fontFamily: theme.fonts.mono },
  codeInput: {
    backgroundColor: theme.colors.panelSoft,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    paddingVertical: 14,
    textAlign: 'center',
    letterSpacing: 10,
    ...theme.type.title,
    fontFamily: theme.fonts.mono,
  },
  codeHelper: { color: theme.colors.muted, ...theme.type.micro, lineHeight: 16 },
  codeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  codeButton: { flex: 1, borderRadius: theme.radius.pill, paddingVertical: 13, alignItems: 'center' },
  codeCancel: { backgroundColor: theme.colors.panelSoft },
  codeCancelText: { color: theme.colors.muted, ...theme.type.body },
  codeConfirm: { backgroundColor: theme.colors.primary },
  codeConfirmText: { color: theme.colors.ink, ...theme.type.body, fontFamily: theme.fonts.headingBlack },
  codeLink: { color: theme.colors.primary, ...theme.type.bodySm, textAlign: 'center', marginTop: 12 },
  offerPrompt: { color: theme.colors.text, ...theme.type.body, marginTop: 6 },
  offerRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  offerButton: { flex: 1, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  offerDecline: { backgroundColor: theme.colors.panelSoft },
  offerDeclineText: { color: theme.colors.muted, ...theme.type.body },
  offerAccept: { backgroundColor: theme.colors.primary },
  offerAcceptText: { color: theme.colors.ink, ...theme.type.body, fontFamily: theme.fonts.headingBlack },
  payValue: {
    color: theme.colors.primary,
    ...theme.type.heading,
    fontFamily: theme.fonts.mono,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  payNote: { color: theme.colors.muted, ...theme.type.micro, marginTop: 4 },
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
