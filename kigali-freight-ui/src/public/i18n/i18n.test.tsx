import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider, useLanguage, preferredLanguage, isLanguage } from './index';
import { en } from './en';
import { rw } from './rw';

// Walks both dictionaries together so a key present in one and missing in
// the other is caught even where TypeScript cannot see it — a value typed
// as string can still be an empty one.
function leaves(obj: unknown, path = ''): [string, unknown][] {
    if (typeof obj !== 'object' || obj === null) return [[path, obj]];
    return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe('the two dictionaries agree', () => {
    it('have exactly the same keys', () => {
        expect(leaves(rw).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
    });

    it('has no empty or placeholder Kinyarwanda', () => {
        const bad = leaves(rw).filter(([, v]) => typeof v !== 'string' || v.trim() === '' || v === 'TODO');
        expect(bad).toEqual([]);
    });

    it('actually translated something rather than copying the English', () => {
        // A dictionary that silently mirrors English would pass every other
        // test here while shipping an untranslated site.
        const enLeaves = leaves(en);
        const identical = leaves(rw).filter(([k, v], i) => v === enLeaves[i][1]);
        // Only proper nouns should ever match, and there are none in here.
        expect(identical.map(([k]) => k)).toEqual([]);
    });
});

describe('choosing a language for a first-time visitor', () => {
    it('honours a returning visitor’s own choice above all', () => {
        expect(preferredLanguage('rw', ['en-GB'])).toBe('rw');
        expect(preferredLanguage('en', ['rw-RW'])).toBe('en');
    });

    it('follows a phone set to Kinyarwanda when there is no stored choice', () => {
        expect(preferredLanguage(null, ['rw-RW', 'en'])).toBe('rw');
        expect(preferredLanguage(null, ['rw'])).toBe('rw');
    });

    it('falls back to English for anyone else', () => {
        expect(preferredLanguage(null, ['en-US'])).toBe('en');
        expect(preferredLanguage(null, [])).toBe('en');
    });

    it('ignores a stored value that is not a language we have', () => {
        expect(preferredLanguage('fr', ['en'])).toBe('en');
        expect(isLanguage('fr')).toBe(false);
    });
});

function Probe() {
    const { t, lang } = useLanguage();
    return <p>{lang}: {t.actions.book}</p>;
}

describe('switching language', () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('changes the words on screen', async () => {
        render(<LanguageProvider><Probe /></LanguageProvider>);
        expect(screen.getByText(/en: Book a delivery/)).toBeInTheDocument();
    });

    it('remembers the choice and tells the document which language it is in', () => {
        window.localStorage.setItem('inzira_lang', 'rw');
        render(<LanguageProvider><Probe /></LanguageProvider>);

        expect(screen.getByText(/rw: Saba ubwikorezi/)).toBeInTheDocument();
        // Screen readers and search engines both read this attribute.
        expect(document.documentElement.lang).toBe('rw');
    });

    it('survives storage being refused, as in private browsing', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        function Switcher() {
            const { setLang, t } = useLanguage();
            return <button onClick={() => setLang('rw')}>{t.actions.book}</button>;
        }
        render(<LanguageProvider><Switcher /></LanguageProvider>);

        // Losing the preference next visit is acceptable; throwing while
        // somebody reads the page is not.
        await userEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('button')).toHaveTextContent('Saba ubwikorezi');
    });

    it('refuses to render outside the provider rather than silently defaulting', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Probe />)).toThrow(/LanguageProvider/);
    });
});
