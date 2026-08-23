import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { AuthScreen, AuthField, AuthButton } from '../AuthScreen';
import { OtpBoxes } from './OtpBoxes';
import { PinPad } from './PinPad';
import { RevealCard } from './RevealCard';
import { BiometricPrompt } from './BiometricPrompt';
import { ConfirmCallModal } from './ConfirmCallModal';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { getRememberedPhone } from '../../lib/tokenStore';
import { readBiometricSupport, useBiometricSupport } from '../../lib/biometrics';
import { requestDriverOtp, verifyDriverOtp, verifyDriverInvite, fetchDispatchContact, type DriverInviteResult } from '../../lib/api';
import type { Toast } from '../ToastOverlay';

type Step = 'phone' | 'otp' | 'invite' | 'reveal' | 'pin-set' | 'pin-confirm' | 'pin-login' | 'biometric';

function formatPhoneDisplay(digits: string) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

// Rwandan mobile numbers are typed as either "788123456" (9 digits, no
// leading 0) or "0788123456" (10 digits, the way people actually type it
// day to day) — both are valid and the backend's normalizePhone already
// accepts either. The input used to cap at 9 raw characters regardless of
// which form was being typed, which silently truncated the last digit of
// anyone typing the natural 10-digit form.
function isCompletePhone(digits: string) {
  if (digits.length === 9) return /^7\d{8}$/.test(digits);
  if (digits.length === 10) return /^07\d{8}$/.test(digits);
  return false;
}

function toNationalDigits(digits: string) {
  return digits.length === 10 && digits.startsWith('0') ? digits.slice(1) : digits;
}

// For display alongside a "+250" country code prefix specifically — strips
// a leading 0 so "0788 123 456" doesn't render as the redundant-looking
// "+250 0788 123 456".
function nationalNumberDisplay(digits: string) {
  return formatPhoneDisplay(toNationalDigits(digits));
}

// The backend's real `username` for a phone/PIN driver is always the
// canonical "+250XXXXXXXXX" form (see adminController.js's inviteDriver) —
// whatever the driver actually typed here could be either 9 or 10 raw
// digits. Session finalization must persist THIS canonical form locally
// (remembered phone, cached username), not the raw typed digits, or the
// locally cached identity silently drifts from the one embedded in the JWT
// and shown everywhere else in the app.
function toCanonicalPhone(digits: string) {
  return `+250${toNationalDigits(digits)}`;
}

// Every step past phone entry used to be a dead end — a typo'd number or a
// session that timed out (the otpSessionToken is only good for 10 minutes)
// left a driver stuck with no way back except force-quitting the app.
function StartOverFooter({ children, onStartOver }: { children?: ReactNode; onStartOver: () => void }) {
  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      {children}
      <TouchableOpacity onPress={onStartOver} hitSlop={8}>
        <Text style={{ color: theme.colors.muted, ...theme.type.label }}>Start over</Text>
      </TouchableOpacity>
    </View>
  );
}

// The whole auth experience is one component driven by a step string,
// matching the design spec's state model exactly:
// phone -> otp -> invite -> reveal -> pin-set -> pin-confirm -> biometric
// A returning driver takes the short path instead: phone -> otp -> pin-login
export function AuthFlow() {
  const { completePinSetup, loginWithPin, enableBiometric, biometricEnabled } = useAuth();
  const biometrics = useBiometricSupport();

  const [step, setStep] = useState<Step>('phone');
  const [deviceSeenBefore, setDeviceSeenBefore] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [resent, setResent] = useState(false);
  const [inviteValue, setInviteValue] = useState('');
  const [inviteError, setInviteError] = useState(false);
  const [otpSessionToken, setOtpSessionToken] = useState<string | null>(null);
  const [revealData, setRevealData] = useState<DriverInviteResult | null>(null);
  const [firstPin, setFirstPin] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dispatchPhone, setDispatchPhone] = useState<string | null>(null);
  const [confirmCallVisible, setConfirmCallVisible] = useState(false);

  useEffect(() => {
    getRememberedPhone().then((phone) => {
      if (phone) {
        setDeviceSeenBefore(true);
        setPhoneDigits(phone.replace(/\D/g, '').slice(-9));
      }
    });
    // Fire-and-forget: this only ever backs the "Contact dispatch" link on
    // the PIN screens, minutes away at the earliest. If it hasn't resolved
    // by then, that link just falls back to plain text instead of blocking
    // anything here.
    fetchDispatchContact()
      .then((result) => setDispatchPhone(result.phoneNumber))
      .catch(() => {});
  }, []);

  // Africa's Talking is not sending yet -- no credit, and the sender ID waits
  // on registering Inzira -- so this is the path a real driver hits today,
  // not a rare failure. Point them at a person rather than leaving them
  // watching an inbox.
  const noSmsMessage = () =>
    dispatchPhone
      ? `We could not text you. Call dispatch on ${dispatchPhone} for your code.`
      : 'We could not text you. Contact dispatch for your code.';

  const enterApp = () => router.replace('/(app)');

  const onSubmitPhone = async () => {
    if (!isCompletePhone(phoneDigits)) {
      setToast({ icon: 'alert-circle-outline', message: 'Enter your full phone number.', tone: 'warning' });
      return;
    }
    setLoading(true);
    setToast(null);
    try {
      const { smsSent } = await requestDriverOtp(phoneDigits);
      setOtpValue('');
      setStep('otp');
      // Still advance: the code exists and is valid whether or not the text
      // went out, so a driver standing next to a dispatcher can be read it.
      // What must not happen is the OTP screen telling them to check their
      // messages when no message was sent.
      if (!smsSent) setToast({ icon: 'chatbubble-ellipses-outline', tone: 'warning',
        message: noSmsMessage() });
    } catch (error) {
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'Could not send a code.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const onOtpComplete = async (code: string) => {
    setLoading(true);
    setToast(null);
    try {
      const result = await verifyDriverOtp(phoneDigits, code);
      setOtpSessionToken(result.otpSessionToken);
      setPinValue('');
      if (!result.returning) {
        setInviteValue('');
        setStep('invite');
      } else if (result.needsPinReset) {
        setStep('pin-set');
      } else {
        setStep('pin-login');
      }
    } catch (error) {
      setOtpError(true);
      setOtpValue('');
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'That code is incorrect.', tone: 'error' });
      setTimeout(() => setOtpError(false), 400);
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      const { smsSent } = await requestDriverOtp(phoneDigits);
      if (!smsSent) {
        setToast({ icon: 'chatbubble-ellipses-outline', tone: 'warning', message: noSmsMessage() });
        return;
      }
      setResent(true);
      setTimeout(() => setResent(false), 2500);
    } catch (error) {
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'Could not resend the code.', tone: 'error' });
    }
  };

  const onInviteComplete = async (code: string) => {
    if (!otpSessionToken) return;
    setLoading(true);
    setToast(null);
    try {
      const result = await verifyDriverInvite(otpSessionToken, code);
      setOtpSessionToken(result.otpSessionToken);
      setRevealData(result);
      setStep('reveal');
    } catch (error) {
      setInviteError(true);
      setInviteValue('');
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'That code is incorrect or expired.', tone: 'error' });
      setTimeout(() => setInviteError(false), 400);
    } finally {
      setLoading(false);
    }
  };

  const onPinSetComplete = (pin: string) => {
    setFirstPin(pin);
    setPinValue('');
    setStep('pin-confirm');
  };

  const onPinConfirmComplete = async (pin: string) => {
    if (pin !== firstPin) {
      setPinError(true);
      setToast({ icon: 'alert-circle-outline', message: "PINs don't match. Try again.", tone: 'warning' });
      setTimeout(() => {
        setPinError(false);
        setPinValue('');
      }, 400);
      return;
    }
    if (!otpSessionToken) return;
    setLoading(true);
    setToast(null);
    try {
      await completePinSetup(otpSessionToken, pin, toCanonicalPhone(phoneDigits));
      // Biometric was already turned on before a dispatcher-triggered PIN
      // reset sent this driver back through pin-set/pin-confirm — no need
      // to offer to enable it again, it's already active.
      //
      // Read fresh here rather than trusting the hook's last value: this
      // runs once, at the end of setup, and the answer decides whether a
      // whole screen appears. Previously the offer was shown on every
      // device, so a phone with no sensor got a screen inviting it to
      // enable something that would silently skip itself when tapped.
      const support = biometricEnabled ? null : await readBiometricSupport();
      if (biometricEnabled || support?.status !== 'available') {
        enterApp();
      } else {
        setStep('biometric');
      }
    } catch (error) {
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'Could not save your PIN.', tone: 'error' });
      setPinValue('');
      setStep('pin-set');
    } finally {
      setLoading(false);
    }
  };

  const onPinLoginComplete = async (pin: string) => {
    if (!otpSessionToken) return;
    setLoading(true);
    setToast(null);
    try {
      await loginWithPin(otpSessionToken, pin, toCanonicalPhone(phoneDigits));
      enterApp();
    } catch (error) {
      setPinError(true);
      setToast({ icon: 'alert-circle-outline', message: error instanceof Error ? error.message : 'Incorrect PIN.', tone: 'error' });
      setTimeout(() => {
        setPinError(false);
        setPinValue('');
      }, 400);
    } finally {
      setLoading(false);
    }
  };

  const onEnableBiometric = async () => {
    await enableBiometric();
    enterApp();
  };

  const resetFlow = () => {
    setStep('phone');
    setPhoneDigits('');
    setOtpValue('');
    setOtpError(false);
    setInviteValue('');
    setInviteError(false);
    setOtpSessionToken(null);
    setRevealData(null);
    setFirstPin('');
    setPinValue('');
    setPinError(false);
    setToast(null);
  };

  switch (step) {
    case 'phone':
      return (
        <AuthScreen
          eyebrow={deviceSeenBefore ? 'Welcome back' : 'Get started'}
          title={deviceSeenBefore ? 'Enter your number.' : "What's your number?"}
          subtitle={
            deviceSeenBefore
              ? "We'll text a quick code to confirm it's you."
              : "We'll text you a code to confirm it's really you."
          }
          toast={toast}
          onDismissToast={() => setToast(null)}
          footer={
            deviceSeenBefore ? undefined : (
              <Text style={{ color: theme.colors.muted, ...theme.type.label, textAlign: 'center', lineHeight: 17 }}>
                Your number needs to already be registered with dispatch — contact them if you&apos;re not set up yet.
              </Text>
            )
          }
        >
          <AuthField
            icon="call-outline"
            value={formatPhoneDisplay(phoneDigits)}
            onChangeText={(text) => {
              setPhoneDigits(text.replace(/\D/g, '').slice(0, 10));
              setToast(null);
            }}
            placeholder="078 000 0000"
            keyboardType="phone-pad"
            editable={!loading}
          />
          <AuthButton label="Send verification code" onPress={onSubmitPhone} loading={loading} disabled={!isCompletePhone(phoneDigits)} />
        </AuthScreen>
      );

    case 'otp':
      return (
        <AuthScreen
          eyebrow="Verification"
          title="Check your messages."
          subtitle={`We sent a 6-digit code to +250 ${nationalNumberDisplay(phoneDigits)}.`}
          toast={toast}
          onDismissToast={() => setToast(null)}
          footer={
            <StartOverFooter onStartOver={resetFlow}>
              <TouchableOpacity onPress={onResend} hitSlop={8} disabled={resent}>
                <Text style={{ color: theme.colors.muted, ...theme.type.bodySm }}>
                  {resent ? (
                    <Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.bodySemiBold }}>Code resent ✓</Text>
                  ) : (
                    <>
                      Didn&apos;t receive it? <Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.bodySemiBold }}>Resend code</Text>
                    </>
                  )}
                </Text>
              </TouchableOpacity>
            </StartOverFooter>
          }
        >
          <OtpBoxes length={6} mode="numeric" value={otpValue} onChange={setOtpValue} onComplete={onOtpComplete} error={otpError} />
        </AuthScreen>
      );

    case 'invite':
      return (
        <AuthScreen
          eyebrow="Dispatch issued"
          title="Enter your invite code."
          subtitle="Dispatch sent you a 6-character code when they set up your account."
          toast={toast}
          onDismissToast={() => setToast(null)}
          footer={
            <StartOverFooter onStartOver={resetFlow}>
              <Text style={{ color: theme.colors.muted, ...theme.type.label, textAlign: 'center' }}>
                Don&apos;t have a code? Contact your dispatcher.{'\n'}Codes expire after 48 hours.
              </Text>
            </StartOverFooter>
          }
        >
          <OtpBoxes length={6} mode="alphanumeric" value={inviteValue} onChange={setInviteValue} onComplete={onInviteComplete} error={inviteError} />
        </AuthScreen>
      );

    case 'reveal':
      return (
        <AuthScreen
          eyebrow="Account activated"
          title={`Welcome, ${(revealData?.fullName || '').split(' ')[0] || 'driver'}.`}
          subtitle="Dispatch has set up your driver account."
          footer={<StartOverFooter onStartOver={resetFlow} />}
        >
          {revealData ? <RevealCard data={revealData} /> : null}
          <AuthButton label="Set up my PIN →" onPress={() => setStep('pin-set')} />
        </AuthScreen>
      );

    case 'pin-set':
      return (
        <AuthScreen
          eyebrow="Security"
          title="Create a 4-digit PIN."
          subtitle="You'll use this every time you sign in. Make it easy to type in a cab."
          toast={toast}
          onDismissToast={() => setToast(null)}
          footer={<StartOverFooter onStartOver={resetFlow} />}
          showLogo={false}
        >
          <PinPad value={pinValue} onChange={setPinValue} onComplete={onPinSetComplete} />
        </AuthScreen>
      );

    case 'pin-confirm':
      return (
        <AuthScreen
          eyebrow="Security"
          title="Confirm your PIN."
          subtitle="Type it once more to make sure it matches."
          toast={toast}
          onDismissToast={() => setToast(null)}
          footer={<StartOverFooter onStartOver={resetFlow} />}
          showLogo={false}
        >
          <PinPad value={pinValue} onChange={setPinValue} onComplete={onPinConfirmComplete} error={pinError} />
        </AuthScreen>
      );

    case 'pin-login':
      return (
        <>
          <AuthScreen
            eyebrow="Driver access"
            title="Enter your PIN."
            toast={toast}
            onDismissToast={() => setToast(null)}
            footer={
              <StartOverFooter onStartOver={resetFlow}>
                <Text style={{ color: theme.colors.muted, ...theme.type.label }}>
                  Forgot your PIN?{' '}
                  {dispatchPhone ? (
                    <Text
                      onPress={() => setConfirmCallVisible(true)}
                      style={{ color: theme.colors.primary, fontFamily: theme.fonts.bodySemiBold }}
                    >
                      Contact dispatch
                    </Text>
                  ) : (
                    <Text>Contact dispatch</Text>
                  )}
                </Text>
              </StartOverFooter>
            }
            showLogo={false}
          >
            <PinPad value={pinValue} onChange={setPinValue} onComplete={onPinLoginComplete} error={pinError} />
          </AuthScreen>
          <ConfirmCallModal
            visible={confirmCallVisible}
            phoneDisplay={dispatchPhone ? `+250 ${formatPhoneDisplay(dispatchPhone.replace('+250', ''))}` : ''}
            onCancel={() => setConfirmCallVisible(false)}
            onConfirm={() => {
              setConfirmCallVisible(false);
              if (dispatchPhone) Linking.openURL(`tel:${dispatchPhone}`);
            }}
          />
        </>
      );

    case 'biometric':
      return (
        <AuthScreen
          eyebrow="Optional"
          title={`Turn on ${biometrics.label}.`}
          subtitle="Faster than typing your PIN every time you start a shift."
          showLogo={false}
        >
          <BiometricPrompt onEnable={onEnableBiometric} onSkip={enterApp} />
        </AuthScreen>
      );

    default:
      return null;
  }
}
