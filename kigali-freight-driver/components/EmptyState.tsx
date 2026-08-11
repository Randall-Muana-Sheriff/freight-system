import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

// One definition of "there is nothing here yet", shared by every list in
// the app. Jobs and Alerts had each grown their own copy — near-identical
// but already drifting on icon size and padding — and the delivery history
// card had none at all, so a new driver saw a titled box containing
// literally nothing.
//
// `compact` is for empty states nested inside a card, where the generous
// full-screen padding would leave an absurd amount of dead space.
export function EmptyState({
  icon,
  title,
  body,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      // Announced as one unit rather than three disconnected fragments,
      // and the icon is decorative so it is not announced separately.
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${body}`}
    >
      <Ionicons
        name={icon}
        size={compact ? 22 : 27}
        color={theme.colors.muted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 44 },
  wrapCompact: { paddingVertical: 20 },
  title: {
    color: theme.colors.text,
    ...theme.type.body,
    fontFamily: theme.fonts.bodySemiBold,
    marginTop: 2,
  },
  body: {
    color: theme.colors.muted,
    ...theme.type.bodySm,
    textAlign: 'center',
    maxWidth: 260,
    fontFamily: theme.fonts.body,
  },
});
