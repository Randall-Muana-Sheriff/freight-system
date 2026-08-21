import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

// Reporting a fault used to go through Alert.alert, which is the OS's own
// dialog: grey card, system typeface, teal buttons, nothing to do with this
// app. ConfirmCallModal already exists for exactly this reason — the native
// dialog lives outside the app's view hierarchy and cannot be themed — and
// this follows it.
//
// The other half is not cosmetic. Alert.prompt is iOS-only, so on Android
// there was no way to type what was actually wrong: the driver could raise a
// defect saying "Tyre condition & pressure checked" and nothing more, while
// the same tap on an iPhone captured a description. A defect without a
// description is a shrug — whoever picks it up has to find the driver and
// ask. One modal fixes both, and gives both platforms the same flow.
export function ReportDefectModal({
  visible,
  itemLabel,
  onCancel,
  onReport,
}: {
  visible: boolean;
  itemLabel: string;
  onCancel: () => void;
  onReport: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  // Cleared on open, not on close. Clearing as it dismisses would wipe the
  // text while the closing animation still shows it.
  useEffect(() => {
    if (visible) setNote('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="build" size={22} color={theme.colors.warning} />
            </View>
            <Text style={styles.title}>Report a fault</Text>
            <Text style={styles.item}>{itemLabel}</Text>

            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="What's wrong with it?"
              placeholderTextColor={theme.colors.muted}
              multiline
              numberOfLines={3}
              maxLength={300}
              autoFocus
            />
            <Text style={styles.hint}>
              Dispatch is told straight away, and the next driver of this vehicle sees it.
            </Text>

            <View style={styles.row}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} activeOpacity={0.85} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              {/* Reporting without a note is allowed. A driver standing in
                  the rain who taps the flag and nothing else has still told
                  us more than silence would. */}
              <TouchableOpacity
                style={[styles.button, styles.reportButton]}
                activeOpacity={0.85}
                onPress={() => onReport(note.trim())}
              >
                <Ionicons name="flag" size={16} color={theme.colors.ink} />
                <Text style={styles.reportText}>Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxWidth: 340,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  // Amber rather than the jade ConfirmCallModal uses: this is a fault being
  // raised, and the ring should say so before the words do.
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: `${theme.colors.warning}18`,
    borderWidth: 1.5,
    borderColor: `${theme.colors.warning}55`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { color: theme.colors.text, ...theme.type.heading, fontFamily: theme.fonts.headingBlack },
  item: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body, textAlign: 'center', marginBottom: 14 },
  input: {
    width: '100%',
    minHeight: 76,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    ...theme.type.bodySm,
    fontFamily: theme.fonts.body,
    textAlignVertical: 'top',
  },
  hint: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.body, textAlign: 'center', marginTop: 10, marginBottom: 16 },
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
  cancelButton: { backgroundColor: theme.colors.panelSoft, borderWidth: 1, borderColor: theme.colors.border },
  cancelText: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  reportButton: { backgroundColor: theme.colors.warning },
  reportText: { color: theme.colors.ink, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
