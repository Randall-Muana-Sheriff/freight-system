import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { theme } from '../lib/theme';
import type { DriverNotification } from '../lib/notifications';

const toneStyles = {
  info: { color: theme.colors.accent, icon: 'information-circle' as const },
  warning: { color: theme.colors.warning, icon: 'alert-circle' as const },
  success: { color: theme.colors.success, icon: 'checkmark-circle' as const },
};

type Props = DriverNotification & { onDismiss?: () => void };

// Flat divided row, same language as AssignmentCard — a bordered box per
// alert made a short list feel heavier than the content warranted.
export function NotificationItem({ title, body, tone, timestamp, onDismiss }: Props) {
  const style = toneStyles[tone];
  const swipeableRef = useRef<SwipeableMethods>(null);

  const row = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${style.color}1F` }]}>
        <Ionicons name={style.icon} size={17} color={style.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.time}>{timestamp}</Text>
        </View>
        <Text style={styles.text}>{body}</Text>
      </View>
    </View>
  );

  if (!onDismiss) return row;

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={56}
      overshootRight={false}
      onSwipeableOpen={() => onDismiss()}
      renderRightActions={() => (
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipeableRef.current?.close();
            onDismiss();
          }}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.ink} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  time: { color: theme.colors.muted, fontSize: 11, fontFamily: theme.fonts.mono },
  title: { flex: 1, color: theme.colors.text, fontSize: 14, fontFamily: theme.fonts.bodySemiBold },
  text: { color: theme.colors.muted, fontSize: 13, lineHeight: 18, fontFamily: theme.fonts.body },
  deleteAction: {
    width: 88,
    marginLeft: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: { color: theme.colors.ink, fontSize: 12, fontFamily: theme.fonts.bodySemiBold },
});
