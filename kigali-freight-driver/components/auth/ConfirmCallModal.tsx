import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';

// The OS's own "call this number?" dialog can't be themed — it lives
// outside the app's view hierarchy entirely, and depending on the device
// (or a minimal environment with no real dialer registered) may not even
// look like a proper call prompt. This is a themed step we control,
// shown before Linking.openURL('tel:...') ever runs.
export function ConfirmCallModal({
  visible,
  phoneDisplay,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  phoneDisplay: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="call" size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Call dispatch?</Text>
          <Text style={styles.phone}>{phoneDisplay}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} activeOpacity={0.85} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.callButton]} activeOpacity={0.85} onPress={onConfirm}>
              <Ionicons name="call" size={16} color={theme.colors.ink} />
              <Text style={styles.callText}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ICON_SIZE = 52;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,13,11,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: `${theme.colors.primary}18`,
    borderWidth: 1.5,
    borderColor: `${theme.colors.primary}55`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.headingBlack },
  phone: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.mono, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    paddingVertical: 13,
  },
  // panelSoft, matching ActionSheet's cancel: this sits on a card, and
  // surface3 now means a screen's primary surface — which the way out of
  // a modal is not.
  cancelButton: { backgroundColor: theme.colors.panelSoft, borderWidth: 1, borderColor: theme.colors.border },
  cancelText: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  callButton: { backgroundColor: theme.colors.primary },
  callText: { color: theme.colors.ink, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
