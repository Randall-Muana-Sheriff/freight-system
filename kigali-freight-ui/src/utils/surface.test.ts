import { describe, it, expect } from 'vitest';
import { resolveSurface, isStaffHost, staffUrl, shouldRedirectToStaffHost } from './surface';

describe('resolveSurface', () => {
    it('gives a dispatch subdomain the board at its own root', () => {
        expect(resolveSurface('dispatch.inzira.systems', '/')).toBe('staff');
    });

    it('keeps the /dispatch path working on any host, so old bookmarks survive', () => {
        expect(resolveSurface('inzira.systems', '/dispatch')).toBe('staff');
        expect(resolveSurface('localhost', '/dispatch')).toBe('staff');
    });

    it('gives the apex to the customer site', () => {
        expect(resolveSurface('inzira.systems', '/')).toBe('public');
    });
});

describe('staffUrl', () => {
    it('points at the configured staff host, crossing origins', () => {
        expect(staffUrl('dispatch.inzira.systems', 'https:')).toBe('https://dispatch.inzira.systems/');
    });

    it('falls back to the path when no staff host is configured', () => {
        // Local development and any deployment without a staff subdomain.
        // Guessing "dispatch." + current host would send the whole team to
        // a name that does not resolve, which is worse than staying put.
        expect(staffUrl('', 'http:')).toBe('/dispatch');
    });
});

describe('shouldRedirectToStaffHost', () => {
    it('moves the board off the apex, so only one origin holds a session', () => {
        // The session is a localStorage JWT and localStorage is per-origin,
        // so a sign-out on one origin cannot clear the other's token.
        expect(shouldRedirectToStaffHost('staff', 'dispatch.inzira.systems', 'inzira.systems')).toBe(true);
    });

    it('does not redirect once it is already home', () => {
        expect(shouldRedirectToStaffHost('staff', 'dispatch.inzira.systems', 'dispatch.inzira.systems')).toBe(false);
    });

    it('ignores case, so a capitalised host cannot cause a redirect loop', () => {
        expect(shouldRedirectToStaffHost('staff', 'dispatch.inzira.systems', 'Dispatch.Inzira.Systems')).toBe(false);
    });

    it('never redirects when no staff host is configured', () => {
        // Every local checkout. Redirecting on a guess would break dev.
        expect(shouldRedirectToStaffHost('staff', '', 'localhost')).toBe(false);
    });

    it('leaves the public site and kiosks alone', () => {
        expect(shouldRedirectToStaffHost('public', 'dispatch.inzira.systems', 'inzira.systems')).toBe(false);
        expect(shouldRedirectToStaffHost('kiosk', 'dispatch.inzira.systems', 'inzira.systems')).toBe(false);
    });
});

describe('isStaffHost', () => {
    it('matches on the first label, so it holds across environments', () => {
        expect(isStaffHost('dispatch.inzira.systems')).toBe(true);
        expect(isStaffHost('admin.staging.inzira.systems')).toBe(true);
        expect(isStaffHost('inzira.systems')).toBe(false);
    });
});
