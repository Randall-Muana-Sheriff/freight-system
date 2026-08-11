import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

export type ActionSheetOption = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

// In-theme replacement for Alert.alert()'s native OS action sheet — same
// role InlineBanner already plays for single-message alerts, extended to
// the "pick one of a few actions, or cancel" case (first use: documents.tsx's
// "Add document" photo-source picker).
export function ActionSheet({
  visible,
  title,
  message,
  options,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  options: ActionSheetOption[];
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Inner Pressable with an empty onPress absorbs taps on the sheet
            itself so they don't bubble up and trigger the backdrop's cancel. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.options}>
            {options.map((option) => (
              <TouchableOpacity key={option.key} style={styles.optionRow} activeOpacity={0.7} onPress={option.onPress}>
                <View style={styles.optionIconWrap}>
                  <Ionicons name={option.icon} size={19} color={theme.colors.primary} />
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} activeOpacity={0.8} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,12,24,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface2,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.heading, textAlign: 'center' },
  message: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  options: { marginTop: 18 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${theme.colors.primary}1F`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { flex: 1, color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  cancelButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cancelText: { color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
});
