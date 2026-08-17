import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import { theme } from '../lib/theme';

// The cold-start entry.
//
// "Inzira" is the road, and the brand mark is exactly that: a pale route
// that runs left to right and ends in a jade pin. So the entry is the
// journey being made rather than a logo fading in — a pin travels the
// route, drawing it as it goes, and settles into the mark itself.
//
// The route is traced from the real artwork, not approximated: assets/
// mark-route.png is the launcher icon's curve lifted onto transparency,
// and PATH_Y below is its measured centreline, so the pin rides the line
// it is drawing instead of a hand-guessed arc near it.
//
// Built on React Native's own Animated with useNativeDriver throughout,
// matching AuthScreen — every value here is a transform or an opacity, so
// the whole sequence runs on the UI thread and holds its frame rate on
// the cheap Androids this app is aimed at. That constraint is also why
// the reveal is a sliding cover in the background colour rather than an
// animated width: width cannot go on the native driver, and the ground
// behind the mark is flat, so a cover is pixel-identical to a real mask.

const routeImage = require('../assets/mark-route.png');
// Letters only — see the crop note in the asset's generator: the full
// wordmark carries its own copy of this route as an underline.
const wordmarkLetters = require('../assets/wordmark-letters.png');

// Geometry of the mark, in the artwork's own pixels, so the numbers can be
// checked against the PNGs rather than tuned by eye. The route occupies
// 728x333 sitting 63px down; the pin is a 268px circle centred right of
// it, which is what pushes the composition wider than the route alone.
const ART = { w: 962, h: 396, routeW: 728, routeH: 333, routeTop: 63, pinX: 828, pinY: 134, pinR: 134 };

// The measured centreline of that curve, sampled evenly across its width.
// Both ends are extrapolated from the neighbouring trend: the artwork's
// first sample sits on the round cap's extreme edge and its last is
// hidden under the pin, so the pixels there describe the drawing rather
// than the line.
const PATH_X = [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48,
    0.52, 0.56, 0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.84, 0.88, 0.92, 0.96, 1];
const PATH_Y = [0.7531, 0.7877, 0.8223, 0.8614, 0.887, 0.8991, 0.8976, 0.887, 0.863, 0.8313,
    0.7892, 0.741, 0.6852, 0.628, 0.5648, 0.503, 0.4383, 0.3765, 0.3178, 0.2605, 0.2108,
    0.1687, 0.137, 0.113, 0.0994, 0.0858];

// Phase boundaries in milliseconds along one timeline, rather than a list
// of durations to be chained.
//
// Chaining mattered: Animated.sequence hands control back to JS between
// steps, and a cold start is the busiest the JS thread ever gets — the
// first screen is mounting, the socket is connecting, the board is being
// fetched. Measured on a real device, the route finished drawing and then
// sat frozen for 600ms waiting for JS to get round to starting the next
// step, which read as the animation having broken.
//
// So there is exactly one Animated.Value, driven linearly start to
// finish, and every property reads a slice of it. Each phase's easing is
// baked into its interpolation table by `phase()` below, which keeps the
// curves without giving up the single native animation. JS is now
// involved once, at the end.
const TRAVEL_END = 780;
const LAND_END = TRAVEL_END + 300;
const WORDMARK_END = TRAVEL_END + 380;   // overlaps the landing on purpose
const EXIT_START = WORDMARK_END + 200;   // a beat on the finished mark
const TOTAL_MS = EXIT_START + 300;

// Reduced motion joins the timeline after the pin has arrived, so the
// mark is simply there and only the wordmark and the exit still play.
const REDUCED_START = LAND_END / TOTAL_MS;

type EasingFn = (value: number) => number;

// Samples `easing` across a slice of the master timeline into a plain
// interpolation table. Clamped at both ends, so before its slice a
// property holds `from` and after it holds `to`.
function phase(
    master: Animated.Value,
    startMs: number,
    endMs: number,
    easing: EasingFn,
    from: number,
    to: number,
    steps = 16
) {
    const inputRange: number[] = [];
    const outputRange: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        inputRange.push((startMs + (endMs - startMs) * u) / TOTAL_MS);
        outputRange.push(from + (to - from) * easing(u));
    }
    return master.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

// Where the centreline sits at a given fraction along the route.
function pathYAt(u: number) {
    if (u <= 0) return PATH_Y[0];
    for (let i = 1; i < PATH_X.length; i++) {
        if (u <= PATH_X[i]) {
            const f = (u - PATH_X[i - 1]) / (PATH_X[i] - PATH_X[i - 1]);
            return PATH_Y[i - 1] + f * (PATH_Y[i] - PATH_Y[i - 1]);
        }
    }
    return PATH_Y[PATH_Y.length - 1];
}

// A driver opens this app many times a day, so the whole sequence is
// under two seconds — and whether it plays at all is the caller's call
// (see app/_layout.tsx), which keeps this component to one job.
export default function BrandEntry({ onDone }: { onDone: () => void }) {
    // One value for the whole entry — see the note on the phase constants.
    const master = useRef(new Animated.Value(0)).current;
    const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

    // Sized off the short edge so a landscape mount (a phone in a cradle,
    // which is where this app lives) does not overflow the mark.
    const { width, height } = Dimensions.get('window');
    const markW = Math.min(Math.min(width, height) * 0.66, 280);
    const scale = markW / ART.w;
    const markH = ART.h * scale;
    const pinR = ART.pinR * scale;
    const startPin = 9; // radius of the travelling pin before it lands

    useEffect(() => {
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .then((on) => !cancelled && setReduceMotion(on))
            .catch(() => !cancelled && setReduceMotion(false));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (reduceMotion === null) return;

        const from = reduceMotion ? REDUCED_START : 0;
        master.setValue(from);
        Animated.timing(master, {
            toValue: 1,
            duration: TOTAL_MS * (1 - from),
            // Linear: every curve in this animation is baked into the
            // interpolation tables, so the master is pure clock.
            easing: Easing.linear,
            useNativeDriver: true,
        }).start(({ finished }) => finished && onDone());
    }, [reduceMotion, master, onDone]);

    if (reduceMotion === null) {
        // One frame of flat ground rather than a half-built mark — the
        // native splash is the same colour, so this is invisible.
        return <View style={[StyleSheet.absoluteFill, styles.ground]} pointerEvents="none" />;
    }

    const travelEase = Easing.inOut(Easing.cubic);
    // Eased at both ends, so the pin pulls away and arrives rather than
    // running at a constant machine speed.
    const pinTravelX = phase(master, 0, TRAVEL_END, travelEase, 0, ART.routeW * scale, 24);

    // The pin's y has to come from the curve rather than a straight line,
    // and the curve is a table over distance travelled — so the easing is
    // applied first and the result looked up, giving one table that already
    // carries both.
    const travelYInput: number[] = [];
    const travelYOutput: number[] = [];
    for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        travelYInput.push((TRAVEL_END * u) / TOTAL_MS);
        travelYOutput.push((ART.routeTop + pathYAt(travelEase(u)) * ART.routeH) * scale);
    }
    const pinTravelY = master.interpolate({
        inputRange: travelYInput,
        outputRange: travelYOutput,
        extrapolate: 'clamp',
    });

    // The cover sits over the undrawn part of the route and slides off to
    // the right, tracking the pin's own x exactly — which is the route's
    // width, not the mark's. The mark is wider than the route (the pin
    // hangs off the end of it), so a cover crossing the full mark width
    // outruns the pin and lays the line down ahead of it.
    //
    // Landing at exactly the pin's centre means the last few pixels of
    // line stay hidden under the pin, so it reads as drawn out from
    // beneath rather than appearing alongside.
    const coverX = pinTravelX;

    // Landing carries the pin from where the path ended to the mark's own
    // pin position and grows it to full size. A touch of overshoot as it
    // settles — back rather than a spring, so the phase has a known length
    // and the rest of the timeline cannot drift.
    const landEase = Easing.out(Easing.back(2));
    const endX = ART.routeW * scale;
    const endY = (ART.routeTop + PATH_Y[PATH_Y.length - 1] * ART.routeH) * scale;
    const pinX = Animated.add(pinTravelX, phase(master, TRAVEL_END, LAND_END, landEase, 0, ART.pinX * scale - endX));
    const pinY = Animated.add(pinTravelY, phase(master, TRAVEL_END, LAND_END, landEase, 0, ART.pinY * scale - endY));
    const pinScale = phase(master, TRAVEL_END, LAND_END, landEase, startPin / pinR, 1);

    const wordEase = Easing.out(Easing.cubic);
    const wordOpacity = phase(master, TRAVEL_END, WORDMARK_END, wordEase, 0, 1);
    const wordLift = phase(master, TRAVEL_END, WORDMARK_END, wordEase, 10, 0);

    const exitEase = Easing.in(Easing.cubic);
    const exitOpacity = phase(master, EXIT_START, TOTAL_MS, exitEase, 1, 0);
    // The whole plate eases back a fraction as it goes, so the app
    // underneath reads as arriving in front of it rather than the splash
    // simply switching off.
    const exitScale = phase(master, EXIT_START, TOTAL_MS, exitEase, 1, 1.06);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                StyleSheet.absoluteFill,
                styles.ground,
                { opacity: exitOpacity, transform: [{ scale: exitScale }] },
            ]}
        >
            <View style={styles.centre}>
                <View style={{ width: markW, height: markH }}>
                    <Image
                        source={routeImage}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: ART.routeTop * scale,
                            width: ART.routeW * scale,
                            height: ART.routeH * scale,
                        }}
                        resizeMode="stretch"
                    />

                    {/* Slides right to uncover the route. Same colour as
                        the ground, and the ground is flat, so it reads as
                        the line being drawn. */}
                    <Animated.View
                        style={{
                            position: 'absolute',
                            top: -markH,
                            bottom: -markH,
                            width: markW + pinR * 2,
                            backgroundColor: theme.colors.bg,
                            transform: [{ translateX: coverX }],
                        }}
                    />

                    {/* The pin: a plain circle rather than part of the
                        PNG, which is the only reason it can travel and
                        grow at all. */}
                    <Animated.View
                        style={{
                            position: 'absolute',
                            left: -pinR,
                            top: -pinR,
                            width: pinR * 2,
                            height: pinR * 2,
                            borderRadius: pinR,
                            backgroundColor: theme.colors.primary,
                            transform: [{ translateX: pinX }, { translateY: pinY }, { scale: pinScale }],
                        }}
                    />
                </View>

                <Animated.Image
                    source={wordmarkLetters}
                    resizeMode="contain"
                    style={[
                        styles.wordmark,
                        {
                            width: markW * 0.52,
                            height: markW * 0.52 * (115 / 329),
                            opacity: wordOpacity,
                            transform: [{ translateY: wordLift }],
                        },
                    ]}
                />
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    ground: { backgroundColor: theme.colors.bg, zIndex: 10 },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    wordmark: { marginTop: 22 },
});
