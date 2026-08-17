import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';
import { useBiometricSupport } from '../../lib/biometrics';

// A one-time offer, shown only right after a driver finishes setting up
// their PIN (never on a returning-driver login) — accepting just flips a
// local flag (see lib/auth.tsx's enableBiometric) that gates the app's
// cold-start session restore. Nothing here talks to the backend.
export function BiometricPrompt({ onEnable, onSkip }: { onEnable: () => void; onSkip: () => void }) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  // Icon and wording both come from lib/biometrics, so this button, the
  // title above it and the toggle in Profile cannot end up calling the
  // same feature three different things. An iPhone with Face ID has no
  // fingerprint sensor at all, so the glyph is not merely generic there —
  // it is wrong.
  const { icon, label } = useBiometricSupport();

  const onPress = async () => {
    setStatus('scanning');
    try {
      const LocalAuthentication = await import('expo-local-authentication');
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        onSkip();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm it's you" });

      if (result.success) {
        setStatus('success');
        setTimeout(onEnable, 450);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.circle}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={status !== 'idle'}
        accessibilityRole="button"
        accessibilityLabel={`Turn on ${label}`}
      >
        {status === 'scanning' ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <Ionicons name={status === 'success' ? 'checkmark-circle' : icon} size={40} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} hitSlop={10} disabled={status === 'scanning'}>
        <Text style={styles.skip}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const CIRCLE_SIZE = 96;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 20, marginTop: 8 },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: `${theme.colors.primary}18`,
    borderWidth: 1.5,
    borderColor: `${theme.colors.primary}55`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.bodyMedium },
});
