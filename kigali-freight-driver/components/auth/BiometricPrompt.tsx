import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';

// A one-time offer, shown only right after a driver finishes setting up
// their PIN (never on a returning-driver login) — accepting just flips a
// local flag (see lib/auth.tsx's enableBiometric) that gates the app's
// cold-start session restore. Nothing here talks to the backend.
export function BiometricPrompt({ onEnable, onSkip }: { onEnable: () => void; onSkip: () => void }) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  // Defaults to the fingerprint glyph (the more common case, and a
  // reasonable fallback while this check is still in flight), but an
  // iPhone with Face ID has no fingerprint sensor at all — showing that
  // icon there would be flat-out wrong, not just generic.
  const [icon, setIcon] = useState<'finger-print-outline' | 'scan-outline'>('finger-print-outline');

  useEffect(() => {
    let cancelled = false;
    // Dynamic import, not a top-level one — see lib/auth.tsx's
    // confirmBiometric for why: a dev-client build made before this
    // native module was added would otherwise crash the whole app just
    // from this file being imported, not merely from calling it.
    import('expo-local-authentication')
      .then((LocalAuthentication) => LocalAuthentication.supportedAuthenticationTypesAsync())
      .then((types) => {
        if (cancelled) return;
        const isFaceOnly = types.includes(2) && !types.includes(1); // FACIAL_RECOGNITION without FINGERPRINT
        setIcon(isFaceOnly ? 'scan-outline' : 'finger-print-outline');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      <TouchableOpacity style={styles.circle} activeOpacity={0.85} onPress={onPress} disabled={status !== 'idle'}>
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
  skip: { color: theme.colors.muted, fontSize: 13, fontFamily: theme.fonts.bodyMedium },
});
