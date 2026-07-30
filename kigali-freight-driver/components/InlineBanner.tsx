import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

export type BannerTone = 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<BannerTone, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(91,140,110,0.12)', border: 'rgba(91,140,110,0.35)', color: theme.colors.success },
  warning: { bg: 'rgba(224,162,56,0.12)', border: 'rgba(224,162,56,0.35)', color: theme.colors.warning },
  danger: { bg: 'rgba(193,68,46,0.12)', border: 'rgba(193,68,46,0.35)', color: theme.colors.danger },
};

// A dismissible, color-coded status line — replaces native Alert.alert()
// for routine success/offline/error feedback that shouldn't interrupt the
// screen with a modal.
export function InlineBanner({
  tone,
  icon,
  message,
  onDismiss,
}: {
  tone: BannerTone;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  onDismiss?: () => void;
}) {
  const palette = TONE_STYLES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Ionicons name={icon} size={18} color={palette.color} />
      <Text style={styles.message}>{message}</Text>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={16} color={theme.colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
  },
  message: { flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 18 },
});
