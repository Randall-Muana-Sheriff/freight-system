import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

// What this device can actually unlock with, and what to call it.
//
// Two separate questions, and expo-local-authentication answers them with
// two different calls that are easy to confuse:
//
//   hasHardwareAsync()   is there a sensor at all
//   isEnrolledAsync()    has the owner actually registered a face/finger
//
// A phone with a fingerprint reader and nothing enrolled will pass the
// first and fail the second, and authenticateAsync() would then fall
// through to a device-credential prompt or simply fail. Offering the
// feature there is offering something that cannot work, so both have to be
// true before any of this is shown.
//
// Imported dynamically, like everywhere else this module is touched — see
// the long note in lib/auth.tsx: a dev-client built before the native
// module existed throws at import time, outside any try/catch, and takes
// the whole app down on launch.

export type BiometricStatus = 'checking' | 'unavailable' | 'available';

export interface BiometricSupport {
    status: BiometricStatus;
    /** What the driver's own phone calls it — "Face ID", "Fingerprint". */
    label: string;
    /** Lower-case, for mid-sentence use. */
    labelLower: string;
    icon: 'scan-outline' | 'finger-print-outline';
}

const UNKNOWN: BiometricSupport = {
    status: 'checking',
    label: 'Biometric unlock',
    labelLower: 'biometrics',
    icon: 'finger-print-outline',
};

// supportedAuthenticationTypesAsync() reports what the hardware has, not
// which of it is enrolled — so on a phone with both a reader and a face
// camera there is no way to know which one the prompt will actually use.
// Naming one of them would be a guess shown to the driver as fact, so that
// case gets the generic wording.
export function describeBiometric(face: boolean, fingerprint: boolean): Omit<BiometricSupport, 'status'> {
    if (face && !fingerprint) {
        // Apple's own name for it, because that is the words on the
        // driver's screen when the system prompt appears. Anything else
        // reads as a different feature.
        return Platform.OS === 'ios'
            ? { label: 'Face ID', labelLower: 'Face ID', icon: 'scan-outline' }
            : { label: 'Face unlock', labelLower: 'face unlock', icon: 'scan-outline' };
    }
    if (fingerprint && !face) {
        return Platform.OS === 'ios'
            ? { label: 'Touch ID', labelLower: 'Touch ID', icon: 'finger-print-outline' }
            : { label: 'Fingerprint', labelLower: 'your fingerprint', icon: 'finger-print-outline' };
    }
    return { label: 'Biometric unlock', labelLower: 'biometrics', icon: 'finger-print-outline' };
}

// The shape this module actually uses. Declared rather than imported so
// the type does not drag the native module in at load time either.
export interface LocalAuthModule {
    hasHardwareAsync(): Promise<boolean>;
    isEnrolledAsync(): Promise<boolean>;
    supportedAuthenticationTypesAsync(): Promise<number[]>;
    AuthenticationType: { FINGERPRINT: number; FACIAL_RECOGNITION: number };
}

// `load` exists so this can be tested. Jest does not transpile dynamic
// import() here, so a real one throws "A dynamic import callback was
// invoked without --experimental-vm-modules" and every call lands in the
// catch below — which would have made the available path untestable, and
// made a passing "returns unavailable" test prove nothing. Production
// passes nothing and gets the real dynamic import.
export async function readBiometricSupport(
    load: () => Promise<LocalAuthModule> = () => import('expo-local-authentication')
): Promise<BiometricSupport> {
    try {
        const LocalAuthentication = await load();
        const [hasHardware, isEnrolled, types] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
            LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        if (!hasHardware || !isEnrolled) {
            return { ...UNKNOWN, status: 'unavailable' };
        }
        return {
            status: 'available',
            ...describeBiometric(
                types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
                types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
            ),
        };
    } catch {
        // No native module in this build, or the call threw. Treated as
        // unavailable rather than assumed-working: this only ever decides
        // whether to *offer* the feature, and offering one that cannot run
        // is worse than not mentioning it. Note this is the opposite of
        // confirmBiometric()'s fail-open in lib/auth.tsx, which is gating
        // an existing session and must never lock a driver out.
        return { ...UNKNOWN, status: 'unavailable' };
    }
}

export function useBiometricSupport(): BiometricSupport {
    const [support, setSupport] = useState<BiometricSupport>(UNKNOWN);

    useEffect(() => {
        let cancelled = false;
        const check = () => {
            void readBiometricSupport().then((next) => {
                if (!cancelled) setSupport(next);
            });
        };
        check();

        // Re-checked whenever the app comes back to the foreground. A
        // driver told "set up a fingerprint first" leaves for Settings and
        // returns; without this the option would stay hidden until the app
        // was restarted, which looks like the advice did not work.
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') check();
        });
        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return support;
}
