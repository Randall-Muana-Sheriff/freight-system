import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { updateTripStop, type Trip, type TripStop } from '../lib/api';
import { ActionSheet } from './ActionSheet';

// The driver's view of a multi-stop run.
//
// Only one stop is ever actionable — the next one. A run is worked in
// order, and showing five sets of buttons at once invites a driver to
// close out stop four from the cab at stop two, which is how proof of
// delivery stops meaning anything. The rest of the sequence is visible
// but inert, because knowing what is coming is the whole point of a run.

const KIND_LABEL: Record<TripStop['kind'], string> = { PICKUP: 'Collect', DROP: 'Deliver' };

// A stop dispatch placed on the map has coordinates but often no street
// text — orders created from the board carry a hub name for the pickup and
// nothing at all for the drop. Saying "no address" there is wrong twice
// over: the location is known, and Navigate works perfectly well from it.
function describeStop(stop: TripStop) {
    if (stop.address_text) return stop.address_text;
    if (stop.lat != null && stop.lng != null) return `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`;
    return 'No location — call dispatch';
}

const FAILURE_REASONS = [
    'Nobody there',
    'Address is wrong',
    'Refused the delivery',
    'Gate or premises closed',
    'Cannot reach the location',
];

function statusColour(status: TripStop['status']) {
    if (status === 'DONE') return theme.colors.success;
    if (status === 'FAILED') return theme.colors.danger;
    if (status === 'SKIPPED') return theme.colors.muted;
    if (status === 'ARRIVED') return theme.colors.warning;
    return theme.colors.muted;
}

export function RunCard({ trip, token, onChanged }: { trip: Trip; token: string; onChanged: (next: Trip) => void }) {
    const [busy, setBusy] = useState(false);
    const [failingStop, setFailingStop] = useState<TripStop | null>(null);
    const [error, setError] = useState<string | null>(null);

    const current = trip.currentStop;

    const act = async (stop: TripStop, status: 'ARRIVED' | 'DONE' | 'FAILED', failureReason?: string) => {
        setBusy(true);
        setError(null);
        try {
            onChanged(await updateTripStop(stop.id, { status, failureReason }, token));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update that stop.');
        } finally {
            setBusy(false);
            setFailingStop(null);
        }
    };

    const navigate = (stop: TripStop) => {
        // Hands off to whatever maps app the driver actually uses rather
        // than pretending to be one.
        const target = stop.lat != null && stop.lng != null
            ? `${stop.lat},${stop.lng}`
            : encodeURIComponent(stop.address_text || '');
        if (!target) return;
        void Linking.openURL(`geo:0,0?q=${target}`).catch(() => {
            void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${target}`);
        });
    };

    return (
        <View style={styles.card}>
            <View style={styles.head}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Today&apos;s run</Text>
                    <Text style={styles.title}>
                        Stop {Math.min(trip.completedStopCount + 1, trip.stopCount)} of {trip.stopCount}
                    </Text>
                </View>
                {trip.planned_distance_m ? (
                    <Text style={styles.distance}>{(trip.planned_distance_m / 1000).toFixed(1)} km</Text>
                ) : null}
            </View>

            {/* Progress across the whole run, not one delivery. */}
            <View style={styles.track}>
                <View
                    style={[
                        styles.fill,
                        { width: `${trip.stopCount ? (trip.completedStopCount / trip.stopCount) * 100 : 0}%` },
                    ]}
                />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {trip.stops.map((stop) => {
                const isCurrent = current?.id === stop.id;
                const settled = ['DONE', 'FAILED', 'SKIPPED'].includes(stop.status);
                return (
                    <View key={stop.id} style={[styles.stop, isCurrent && styles.stopCurrent]}>
                        <View style={styles.stopHead}>
                            <View style={[styles.seq, isCurrent && styles.seqCurrent]}>
                                {settled ? (
                                    <Ionicons
                                        name={stop.status === 'DONE' ? 'checkmark' : 'close'}
                                        size={13}
                                        color={statusColour(stop.status)}
                                    />
                                ) : (
                                    <Text style={[styles.seqText, isCurrent && styles.seqTextCurrent]}>{stop.sequence}</Text>
                                )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.kind, { color: stop.kind === 'PICKUP' ? theme.colors.accent : theme.colors.primary }]}>
                                    {KIND_LABEL[stop.kind]}
                                </Text>
                                <Text
                                    style={[
                                        styles.address,
                                        settled && styles.addressSettled,
                                        !stop.address_text && styles.addressCoords,
                                    ]}
                                    numberOfLines={2}
                                >
                                    {describeStop(stop)}
                                </Text>
                                <Text style={styles.cargo} numberOfLines={1}>{stop.cargo_description}</Text>
                                {stop.failure_reason ? (
                                    <Text style={styles.reason}>{stop.failure_reason}</Text>
                                ) : null}
                            </View>
                        </View>

                        {/* The customer's own words travel with the stop, not
                            just with the order — a driver on stop four should
                            not have to remember which job the gate code was on. */}
                        {isCurrent && stop.special_instructions ? (
                            <View style={styles.note}>
                                <Ionicons name="alert-circle-outline" size={13} color={theme.colors.warning} />
                                <Text style={styles.noteText}>{stop.special_instructions}</Text>
                            </View>
                        ) : null}

                        {isCurrent ? (
                            <View style={styles.actions}>
                                <TouchableOpacity style={styles.secondary} onPress={() => navigate(stop)} activeOpacity={0.85}>
                                    <Ionicons name="navigate-outline" size={14} color={theme.colors.primary} />
                                    <Text style={styles.secondaryText}>Navigate</Text>
                                </TouchableOpacity>

                                {stop.status === 'PENDING' ? (
                                    <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => void act(stop, 'ARRIVED')} activeOpacity={0.9}>
                                        {busy ? <ActivityIndicator color={theme.colors.ink} size="small" /> : (
                                            <>
                                                <Ionicons name="flag-outline" size={14} color={theme.colors.ink} />
                                                <Text style={styles.primaryText}>I&apos;m here</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => void act(stop, 'DONE')} activeOpacity={0.9}>
                                        {busy ? <ActivityIndicator color={theme.colors.ink} size="small" /> : (
                                            <>
                                                <Ionicons name="checkmark" size={15} color={theme.colors.ink} />
                                                <Text style={styles.primaryText}>{stop.kind === 'PICKUP' ? 'Collected' : 'Delivered'}</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity style={styles.skip} disabled={busy} onPress={() => setFailingStop(stop)} activeOpacity={0.85}>
                                    <Text style={styles.skipText}>Can&apos;t do it</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}
                    </View>
                );
            })}

            {/* A reason is required by the API, so it is asked for as a
                choice rather than a free-text box a driver has to type
                one-handed. Dispatch can act on "nobody there"; they cannot
                act on an empty string. */}
            <ActionSheet
                visible={failingStop !== null}
                title="What happened?"
                message="Dispatch sees this straight away and decides what to do with the order."
                onCancel={() => setFailingStop(null)}
                options={FAILURE_REASONS.map((reason) => ({
                    key: reason,
                    label: reason,
                    icon: 'alert-circle-outline' as const,
                    onPress: () => {
                        if (failingStop) void act(failingStop, 'FAILED', reason);
                    },
                }))}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // surface3: while a run is on, it is the primary thing on this screen.
    card: {
        backgroundColor: theme.colors.surface3,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
        marginBottom: 20,
        gap: 10,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    eyebrow: {
        color: theme.colors.muted,
        ...theme.type.micro,
        fontFamily: theme.fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    title: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.bodySemiBold },
    distance: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.mono },
    track: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surface1, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 },
    error: { color: theme.colors.danger, ...theme.type.label, fontFamily: theme.fonts.body },

    stop: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, gap: 8 },
    stopCurrent: { borderTopColor: `${theme.colors.primary}55` },
    stopHead: { flexDirection: 'row', gap: 10 },
    seq: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    seqCurrent: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
    seqText: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
    seqTextCurrent: { color: theme.colors.primary },
    kind: { ...theme.type.micro, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.6 },
    address: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodyMedium },
    // Coordinates are data, not a place name, so they are set in the mono
    // face — it also stops them being mistaken for a street a driver should
    // recognise.
    addressCoords: { fontFamily: theme.fonts.mono, ...theme.type.label },
    addressSettled: { color: theme.colors.muted, textDecorationLine: 'line-through' },
    cargo: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
    reason: { color: theme.colors.danger, ...theme.type.micro, fontFamily: theme.fonts.body, marginTop: 2 },

    note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    noteText: { flex: 1, color: theme.colors.warning, ...theme.type.label, fontFamily: theme.fonts.body },

    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    primary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.pill,
        paddingVertical: 11,
    },
    primaryText: { color: theme.colors.ink, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
    secondary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderColor: `${theme.colors.primary}55`,
        borderRadius: theme.radius.pill,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    secondaryText: { color: theme.colors.primary, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
    skip: { paddingVertical: 10, paddingHorizontal: 4 },
    skipText: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.bodyMedium },
});
