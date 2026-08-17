import { describe, it, expect, afterEach } from 'vitest';
import { isPreLaunch, LAUNCH_DATE } from './launch';

// jsdom's location is read-only in the usual sense but the hostname can be
// swapped by redefining the property, which is what these tests need: the
// whole behaviour under test is "which host is asking".
const realLocation = window.location;

function onHost(hostname: string) {
    Object.defineProperty(window, 'location', {
        value: { ...realLocation, hostname },
        writable: true,
        configurable: true,
    });
}

afterEach(() => {
    Object.defineProperty(window, 'location', {
        value: realLocation,
        writable: true,
        configurable: true,
    });
});

const beforeLaunch = new Date(LAUNCH_DATE.getTime() - 60_000);
const afterLaunch = new Date(LAUNCH_DATE.getTime() + 60_000);

describe('isPreLaunch', () => {
    it('holds the countdown up for real visitors before the launch date', () => {
        onHost('inzira.systems');
        expect(isPreLaunch(beforeLaunch)).toBe(true);
        onHost('www.inzira.systems');
        expect(isPreLaunch(beforeLaunch)).toBe(true);
    });

    it('stands down on its own once the launch date passes', () => {
        onHost('inzira.systems');
        expect(isPreLaunch(afterLaunch)).toBe(false);
    });

    // The reason this function is host-aware at all: with the countdown
    // live in production, working on the landing page must not require
    // editing the flag — that is how a flipped flag ships by accident.
    it.each(['localhost', '127.0.0.1', '0.0.0.0', 'muana-box.local', '192.168.1.44', '10.0.0.5', '172.20.0.3'])(
        'never holds a developer back on %s',
        (host) => {
            onHost(host);
            expect(isPreLaunch(beforeLaunch)).toBe(false);
        }
    );

    // 172.15 and 172.32 sit just outside the private range and are public
    // addresses, so the narrow bounds of that regex are worth pinning.
    it.each(['172.15.0.1', '172.32.0.1', 'inzira.systems.evil.com'])(
        'treats %s as a real visitor',
        (host) => {
            onHost(host);
            expect(isPreLaunch(beforeLaunch)).toBe(true);
        }
    );
});
