import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../lib/theme';
import type { DriverInviteResult } from '../../lib/api';

// A legitimate bordered card, unlike the rest of the flow's flat scaffolding
// — this is the one screen where dispatch is handing the driver a set of
// facts about themselves (staff ID, vehicle) they didn't type in, so it
// reads as a document being presented rather than a form being filled out.
export function RevealCard({ data }: { data: DriverInviteResult }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [anim]);

  const initial = (data.fullName || 'D').trim().charAt(0).toUpperCase();

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
      ]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{initial}</Text>
      </View>
      <Text style={styles.name}>{data.fullName}</Text>
      <Text style={styles.role}>
        {data.role} · {data.fleet}
      </Text>

      <View style={styles.divider} />

      <Row label="Staff ID" value={data.staffId} />
      {data.vehicle ? (
        <>
          <Row label="Vehicle" value={data.vehicle.plateNumber} />
          <Row label="Type" value={data.vehicle.vehicleType.replace(/_/g, ' ')} />
        </>
      ) : (
        <Row label="Vehicle" value="Not yet assigned" />
      )}
    </Animated.View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 22,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${theme.colors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitial: { color: theme.colors.primary, ...theme.type.display, fontFamily: theme.fonts.headingBlack },
  name: { color: theme.colors.text, ...theme.type.title, fontFamily: theme.fonts.headingBlack, textAlign: 'center' },
  role: {
    color: theme.colors.muted,
    ...theme.type.micro,
    fontFamily: theme.fonts.mono,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  divider: { height: 1, backgroundColor: theme.colors.border, alignSelf: 'stretch', marginVertical: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingVertical: 6, gap: 12 },
  rowLabel: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  rowValue: { flexShrink: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold, textTransform: 'capitalize' },
});
