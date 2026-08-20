import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider, useLanguage, preferredLanguage, isLanguage, useApiError } from './index';
import { ApiError } from '../publicApi';
import { en } from './en';
import { rw } from './rw';
import { fr } from './fr';
import { coverage } from './index';

// Walks both dictionaries together so a key present in one and missing in
// the other is caught even where TypeScript cannot see it — a value typed
// as string can still be an empty one.
function leaves(obj: unknown, path = ''): [string, unknown][] {
    if (typeof obj !== 'object' || obj === null) return [[path, obj]];
    return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe('French is complete', () => {
    it('has exactly the keys English has', () => {
        expect(leaves(fr).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
    });

    it('has nothing blank', () => {
        expect(leaves(fr).filter(([, v]) => typeof v !== 'string' || v.trim() === '')).toEqual([]);
    });

    it('is a translation and not a copy of the English', () => {
        // A dictionary that silently mirrors English passes every other
        // check here while shipping an untranslated page. Listed rather
        // than merely tolerated: each of these is identical for a reason,
        // and a ninth appearing means somebody forgot to translate it.
        const legitimatelyIdentical = [
            'order.weightPlaceholder',   // "150" — a number
            'order.namePlaceholder',     // "Jean Mutabazi" — a Rwandan name
            'order.phonePlaceholder',    // "0788 000 000" — a number
            'misc.codePlaceholder',      // "INZ-XXXXXXXX" — a code format
            'misc.cityCountry',          // "Kigali, Rwanda" — proper nouns
            'coming.minutes',            // "Min" — the same abbreviation in French
            'coming.seconds',            // "Sec" — likewise
            'cargo.Documents',           // the same word in French
            'review.contact',            // likewise
            'language.kinyarwanda',      // the language's own name
        ];
        const enLeaves = leaves(en);
        const same = leaves(fr).filter(([, v], i) => v === enLeaves[i][1]).map(([k]) => k);
        expect(same.sort()).toEqual([...legitimatelyIdentical].sort());
    });
});

describe('Kinyarwanda is honestly partial', () => {
    it('translates only keys English actually has', () => {
        // The reverse of completeness: a stray key here is a typo that
        // would never show up on screen.
        const enKeys = new Set(leaves(en).map(([k]) => k));
        const stray = leaves(rw).map(([k]) => k).filter((k) => !enKeys.has(k));
        expect(stray).toEqual([]);
    });

    it('has nothing blank or left as a placeholder', () => {
        const bad = leaves(rw).filter(([, v]) => typeof v !== 'string' || v.trim() === '' || v === 'TODO');
        expect(bad).toEqual([]);
    });

    it('reports how much is still to write', () => {
        // Progress is a number somebody can look at rather than something
        // discovered on a live page.
        const { translated, total } = coverage('rw');
        expect(total).toBeGreaterThan(translated);
        expect(translated).toBeGreaterThan(0);
    });

    it('is complete for the interface, whatever the prose is doing', () => {
        // The half that decides whether the site can be *used* in
        // Kinyarwanda must be finished even while the copy is not.
        for (const section of ['nav', 'actions', 'form', 'footer', 'language'] as const) {
            const missing = leaves((en as Record<string, unknown>)[section], section)
                .map(([k]) => k)
                .filter((k) => {
                    const path = k.split('.').slice(1);
                    let node: unknown = (rw as Record<string, unknown>)[section];
                    for (const step of path) node = (node as Record<string, unknown>)?.[step];
                    return node === undefined;
                });
            expect(missing, `${section} is not fully translated`).toEqual([]);
        }
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
        // 'fr' was the example here until French was added — which is
        // exactly the drift that made isLanguage reject a real language.
        expect(preferredLanguage('de', ['en'])).toBe('en');
        expect(isLanguage('de')).toBe(false);
        expect(isLanguage('fr')).toBe(true);
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

describe('the language picker', () => {
    beforeEach(() => window.localStorage.clear());

    it('offers every language, each written in its own language', async () => {
        const { PublicHeader } = await import('../Chrome');
        render(<LanguageProvider><PublicHeader onNavigate={() => {}} /></LanguageProvider>);

        const picker = screen.getByRole('combobox', { name: /language|ururimi|langue/i });
        const options = Array.from(picker.querySelectorAll('option')).map((o) => o.textContent);
        expect(options).toEqual(['English', 'Ikinyarwanda', 'Français']);
    });

    it('changes the page when a language is chosen', async () => {
        const { PublicHeader } = await import('../Chrome');
        render(<LanguageProvider><PublicHeader onNavigate={() => {}} /></LanguageProvider>);

        expect(screen.getByText('Book a delivery')).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByRole('combobox'), 'fr');

        expect(screen.getByText('Commander une livraison')).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('fr');
    });

    it('has a label a screen reader can announce', async () => {
        const { PublicHeader } = await import('../Chrome');
        render(<LanguageProvider><PublicHeader onNavigate={() => {}} /></LanguageProvider>);
        // Visually hidden, but present — a bare select with a flag icon is
        // an unlabelled control to anyone not looking at it.
        expect(screen.getByLabelText('Language')).toBeInTheDocument();
    });
});

describe('API errors in the reader’s language', () => {
    function ErrorProbe({ thrown }: { thrown: unknown }) {
        const describe_ = useApiError();
        return <p>{describe_(thrown)}</p>;
    }

    it('translates a known error code', () => {
        window.localStorage.setItem('inzira_lang', 'fr');
        render(<LanguageProvider><ErrorProbe thrown={new ApiError('No shipment found with that code.', 'NOT_FOUND')} /></LanguageProvider>);
        expect(screen.getByText(/Aucune expédition ne correspond/)).toBeInTheDocument();
    });

    it('falls back to the server’s own message for a code it does not know', () => {
        // Readable-but-English beats blank when the server grows a new error.
        window.localStorage.setItem('inzira_lang', 'fr');
        render(<LanguageProvider><ErrorProbe thrown={new ApiError('Some brand new failure', 'NEVER_SEEN_BEFORE')} /></LanguageProvider>);
        expect(screen.getByText('Some brand new failure')).toBeInTheDocument();
    });

    it('says something even when what was thrown carries nothing useful', () => {
        window.localStorage.setItem('inzira_lang', 'fr');
        render(<LanguageProvider><ErrorProbe thrown={{}} /></LanguageProvider>);
        expect(screen.getByText('Une erreur est survenue. Merci de réessayer.')).toBeInTheDocument();
    });
});
