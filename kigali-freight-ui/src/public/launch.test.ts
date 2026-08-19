import { describe, it, expect, afterEach } from 'vitest';
import { isPreLaunch, isLocalHost, LAUNCH_DATE, COUNTDOWN_ENABLED } from './launch';

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

// Host classification is tested directly rather than through isPreLaunch,
// which short-circuits on COUNTDOWN_ENABLED. Going through the front door
// meant flipping that switch broke every one of these, even though none of
// them is about the switch.
describe('isLocalHost', () => {
    it.each(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'muana-box.local',
             '192.168.1.44', '10.0.0.5', '172.20.0.3', '172.16.0.1', '172.31.255.254'])(
        'recognises %s as one of our own machines',
        (host) => expect(isLocalHost(host)).toBe(true)
    );

    // 172.15 and 172.32 sit just outside the private range and are public
    // addresses, so the narrow bounds of that regex are worth pinning.
    it.each(['inzira.systems', 'www.inzira.systems', '172.15.0.1', '172.32.0.1',
             '11.0.0.1', '193.168.1.1'])(
        'treats %s as a real visitor',
        (host) => expect(isLocalHost(host)).toBe(false)
    );

    // The check is a suffix match on ".local" and exact matches otherwise —
    // a hostname that merely contains one of ours must not slip through.
    it.each(['inzira.systems.evil.com', 'localhost.evil.com', 'notlocalhost',
             '192.168.1.44.evil.com'])(
        'is not fooled by %s',
        (host) => expect(isLocalHost(host)).toBe(false)
    );
});

describe('isPreLaunch', () => {
    // True whichever way the master switch is set, so this suite survives
    // the site being opened and closed again.
    it('never holds a developer back, switch on or off', () => {
        onHost('localhost');
        expect(isPreLaunch(beforeLaunch)).toBe(false);
        onHost('192.168.1.44');
        expect(isPreLaunch(beforeLaunch)).toBe(false);
    });

    it('stands down on its own once the launch date passes', () => {
        onHost('inzira.systems');
        expect(isPreLaunch(afterLaunch)).toBe(false);
    });

    it('follows the master switch for a real visitor before launch', () => {
        // Asserted against the flag rather than a hardcoded expectation:
        // the switch is meant to be flipped, and a test that has to be
        // edited every time it moves is a test nobody trusts.
        onHost('inzira.systems');
        expect(isPreLaunch(beforeLaunch)).toBe(COUNTDOWN_ENABLED);
    });
});
