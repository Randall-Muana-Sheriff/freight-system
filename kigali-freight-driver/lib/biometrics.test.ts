import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Platform } from 'react-native';
import { describeBiometric, readBiometricSupport, type LocalAuthModule } from './biometrics';

const mockLocalAuth = {
    hasHardwareAsync: jest.fn<() => Promise<boolean>>(),
    isEnrolledAsync: jest.fn<() => Promise<boolean>>(),
    supportedAuthenticationTypesAsync: jest.fn<() => Promise<number[]>>(),
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
};

// Injected rather than jest.mock'd: the module is reached through a
// dynamic import, which jest leaves untranspiled here.
const load = () => Promise.resolve(mockLocalAuth as unknown as LocalAuthModule);

const FACE = 2;
const FINGERPRINT = 1;

function onPlatform(os: 'ios' | 'android') {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

const realOS = Platform.OS;
afterEach(() => onPlatform(realOS as 'ios' | 'android'));

// Whatever the system prompt is about to say, the app has to have said the
// same thing — a driver told to enable "Biometric login" who then sees an
// iOS Face ID sheet has been shown two names for one feature.
describe('describeBiometric', () => {
    it('uses Apple names on iOS', () => {
        onPlatform('ios');
        expect(describeBiometric(true, false).label).toBe('Face ID');
        expect(describeBiometric(false, true).label).toBe('Touch ID');
    });

    it('uses plain names on Android', () => {
        onPlatform('android');
        expect(describeBiometric(true, false).label).toBe('Face unlock');
        expect(describeBiometric(false, true).label).toBe('Fingerprint');
    });

    it('shows the face icon only when there is no fingerprint reader', () => {
        onPlatform('ios');
        // A Face ID iPhone has no fingerprint sensor, so a fingerprint
        // glyph there is wrong rather than merely generic.
        expect(describeBiometric(true, false).icon).toBe('scan-outline');
        expect(describeBiometric(false, true).icon).toBe('finger-print-outline');
    });

    it('stays generic when the hardware has both', () => {
        onPlatform('android');
        // supportedAuthenticationTypesAsync reports hardware, not what is
        // enrolled, so with both present we cannot know which the prompt
        // will use. Naming one would be a guess presented as fact.
        expect(describeBiometric(true, true).label).toBe('Biometric unlock');
        expect(describeBiometric(false, false).label).toBe('Biometric unlock');
    });
});

describe('readBiometricSupport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        onPlatform('android');
        mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([FINGERPRINT]);
    });

    it('is available only with hardware AND an enrolment', async () => {
        mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
        mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
        const support = await readBiometricSupport(load);
        expect(support.status).toBe('available');
        expect(support.label).toBe('Fingerprint');
    });

    it('is unavailable when a sensor exists but nothing is enrolled', async () => {
        // The case worth having a test for: hasHardware alone would say
        // yes here, and the app would offer an unlock that cannot run.
        mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
        mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
        expect((await readBiometricSupport(load)).status).toBe('unavailable');
    });

    it('is unavailable when there is no sensor', async () => {
        mockLocalAuth.hasHardwareAsync.mockResolvedValue(false);
        mockLocalAuth.isEnrolledAsync.mockResolvedValue(false);
        expect((await readBiometricSupport(load)).status).toBe('unavailable');
    });

    it('is unavailable, not assumed working, when the native call throws', async () => {
        // Deliberately the opposite of confirmBiometric()'s fail-open in
        // lib/auth.tsx: that one guards a live session and must never lock
        // a driver out, this one only decides whether to offer the feature.
        mockLocalAuth.hasHardwareAsync.mockRejectedValue(new Error('no native module'));
        mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
        expect((await readBiometricSupport(load)).status).toBe('unavailable');

        // And when the module is missing from the build entirely.
        const missing = () => Promise.reject(new Error('module not found'));
        expect((await readBiometricSupport(missing as never)).status).toBe('unavailable');
    });

    it('reads Face ID off a Face-ID-only iPhone', async () => {
        onPlatform('ios');
        mockLocalAuth.hasHardwareAsync.mockResolvedValue(true);
        mockLocalAuth.isEnrolledAsync.mockResolvedValue(true);
        mockLocalAuth.supportedAuthenticationTypesAsync.mockResolvedValue([FACE]);
        const support = await readBiometricSupport(load);
        expect(support).toMatchObject({ status: 'available', label: 'Face ID', icon: 'scan-outline' });
    });
});
