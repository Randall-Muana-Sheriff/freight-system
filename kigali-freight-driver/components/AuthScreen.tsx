import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { ToastOverlay, type Toast } from './ToastOverlay';

// Pre-rendered PNGs rather than inline SVG/gradient components:
// react-native-svg and expo-linear-gradient aren't dependencies here, and
// adding either would mean a native rebuild just for static brand
// visuals. Both images are rendered once (via a headless-Chrome capture
// of the exact same CSS/SVG used on the web dashboard) so mobile and web
// share one brand moment instead of two independently-drawn looks.
const wordmark = require('../assets/inzira-wordmark.png');
// The same soft jade radial glow the web dashboard's login screen uses
// behind its wordmark — this screen was otherwise a flat solid color
// with no atmosphere of its own.
const authBackground = require('../assets/auth-bg.png');

// paddingTop(64) + wordmarkImage height(85) + tagline row(21) +
// paddingBottom(20) from styles.brandRow/styles.tagline below — kept as one
// constant so the keyboard-collapse animation (which animates a wrapping
// View's height, not brandRow's own padding) knows exactly how tall the
// fully-expanded row is.
const BRAND_ROW_HEIGHT = 64 + 85 + 21 + 20;

// The wordmark image has the route line and its end-pin baked in as flat
// pixels, so they can't be animated on their own — this glow is a
// separate, purely-native-style circle laid behind the image, roughly
// where the pin sits (bottom-right of the word), rather than an attempt
// to animate anything inside the PNG itself.
function AnimatedLogo() {
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // A fixed-position logo (see the comment where <AnimatedLogo> is used
  // below) reserves the same chunk of vertical space on every screen
  // regardless of keyboard state — fine most of the time, but on a
  // shorter real device the on-screen keyboard can then leave barely any
  // room for the field it's supposed to be helping you see. Collapsing
  // the row away while the keyboard is up trades "stable logo position"
  // for "can actually see what you're typing," which only matters right
  // when it would otherwise be a problem.
  //
  // Driven by LayoutAnimation rather than an Animated.Value: height is one
  // of the few properties Animated can't run on the native thread, so a
  // manually-interpolated height animates frame-by-frame over the JS
  // bridge — noticeably less smooth than handing the same before/after
  // state change to the native layout-animation system, which is what
  // LayoutAnimation does under the hood on both platforms.
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // A radar-ping loop: grow + fade out, snap back, pause, repeat. Starts
    // right away rather than waiting for the entrance to finish — the two
    // read as one continuous "arriving, then alive" moment instead of two
    // separate steps.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(650),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enter, pulse]);

  useEffect(() => {
    // Android never fires the "will" variants, so this must branch by
    // platform rather than just always using the show/hide pair — using
    // "did" on iOS instead would work too, just noticeably laggier since
    // it fires after the keyboard has already finished animating in.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const toggle = (visible: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
      setKeyboardShown(visible);
    };
    const showSub = Keyboard.addListener(showEvent, () => toggle(true));
    const hideSub = Keyboard.addListener(hideEvent, () => toggle(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <View
      style={{
        height: keyboardShown ? 0 : BRAND_ROW_HEIGHT,
        opacity: keyboardShown ? 0 : 1,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          styles.brandRow,
          {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <View style={styles.wordmarkWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pinGlow,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
              },
            ]}
          />
          <Image source={wordmark} style={styles.wordmarkImage} resizeMode="contain" />
        </View>
        <Text style={styles.tagline}>Straight to where it needs to be.</Text>
      </Animated.View>
    </View>
  );
}

// Everything — brand mark, title, fields, button — lives inside one
// ScrollView wrapped by KeyboardAvoidingView. The previous version had a
// fixed-height gradient hero sitting outside that wrapper, which is
// exactly why the keyboard could cover the lower fields: that band
// couldn't shrink to make room. Nothing here is fixed-height now, so the
// keyboard always has room to push into.
export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  toast,
  onDismissToast,
  children,
  footer,
  showLogo = true,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  toast?: Toast | null;
  onDismissToast?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  // The phone screen is the flow's one true entry point — every other step
  // is reached seconds later within the same session, so the wordmark
  // there is doing real "which app is this" work. Mid-flow steps like PIN
  // confirmation and the biometric offer are lower-stakes continuations,
  // not fresh trust decisions, so they can drop it to save space.
  showLogo?: boolean;
}) {
  return (
    // Android's manifest already has windowSoftInputMode="adjustResize"
    // baked in, which resizes the window at the OS level when the keyboard
    // opens — that's the actual fix for "keyboard covers the input" on
    // Android. KeyboardAvoidingView's own height/padding behavior on top
    // of that double-compensates (the OS already shrank the window, then
    // this shrinks it again), which is what left a gap exposing the
    // system's default background the moment a field was focused. iOS has
    // no equivalent OS-level behavior, so it still needs this.
    <View style={styles.screen}>
      <Image source={authBackground} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {/* Deliberately outside the centered ScrollView content below: that
          block's height varies screen to screen (a subtitle here, a taller
          footer there), so a logo living inside it drifted up and down by
          over 100px between steps. Giving it its own fixed-height row here
          means it sits at the same position on every screen that shows it,
          instead of moving depending on how much content follows. */}
      {showLogo ? <AnimatedLogo /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.fields}>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>

        <ToastOverlay toast={toast ?? null} onHide={onDismissToast ?? (() => {})} />
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthField({
  icon,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  error,
  editable = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  editable?: boolean;
}) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={field.wrap}>
      <View style={[field.row, focused && field.rowFocused, error && field.rowError]}>
        <Ionicons name={icon} size={18} color={focused ? theme.colors.primary : theme.colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[field.input, !editable && field.inputDisabled]}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={field.errorText}>{error}</Text> : null}
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[button.base, isDisabled && button.disabled]}
    >
      {loading ? <ActivityIndicator color={theme.colors.paper} /> : <Text style={button.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Fallback fill in case the background image hasn't decoded yet — avoids
  // a flash of the system's default white before it appears.
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 40 },
  brandRow: { alignItems: 'center', paddingTop: 64, paddingBottom: 20 },
  wordmarkWrap: { width: 190, height: 85 },
  wordmarkImage: { width: 190, height: 85 },
  tagline: {
    color: theme.colors.muted,
    fontSize: 12,
    letterSpacing: 0.2,
    fontFamily: theme.fonts.body,
    marginTop: 6,
  },
  // Positioned by eye against the baked-in pin at the end of the route
  // line (bottom-right of the wordmark box) — a glow is forgiving of being
  // a few pixels off in a way a crisp overlapping shape wouldn't be.
  pinGlow: {
    position: 'absolute',
    right: 3,
    bottom: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontFamily: theme.fonts.mono,
    marginBottom: 8,
  },
  title: { color: theme.colors.text, fontSize: 26, fontFamily: theme.fonts.headingBlack, letterSpacing: -0.3 },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 340, fontFamily: theme.fonts.body },
  fields: { gap: 16, marginTop: 28 },
  footer: { alignItems: 'center', marginTop: 26 },
});

const field = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowFocused: { borderColor: theme.colors.primary },
  rowError: { borderColor: theme.colors.danger },
  input: { flex: 1, color: theme.colors.text, fontSize: 15, fontFamily: theme.fonts.body },
  inputDisabled: { opacity: 0.5 },
  errorText: { color: theme.colors.danger, fontSize: 11, marginLeft: 4, fontFamily: theme.fonts.bodyMedium },
});

const button = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    marginTop: 6,
  },
  disabled: { opacity: 0.6 },
  text: { color: theme.colors.ink, fontSize: 15, fontFamily: theme.fonts.bodySemiBold },
});
