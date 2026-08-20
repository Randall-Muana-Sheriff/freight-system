import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type Strings, type PartialStrings } from './en';
import { rw } from './rw';
import { fr } from './fr';
import { supportEn } from './docs/support.en';
import { supportFr } from './docs/support.fr';
import { privacyEn } from './docs/privacy.en';
import { privacyFr } from './docs/privacy.fr';

// Language for the customer site.
//
// Hand-rolled rather than react-i18next for the same reason this app has
// no router: two languages and one flat dictionary do not need a library,
// and the type checker already gives the guarantee a library would sell —
// rw.ts is typed against en.ts, so a missing translation cannot ship.
//
// The staff board is deliberately out of scope. Dispatchers are trained on
// one vocabulary and translating an internal tool halfway is how two people
// end up describing the same screen differently on a phone call.

// Rwanda's official languages, in the order a Kigali visitor is most
// likely to want them. Each label is written in its own language: someone
// looking for Kinyarwanda is scanning for "Ikinyarwanda", not for the
// English word for it.
export const LANGUAGES = { en: 'English', rw: 'Ikinyarwanda', fr: 'Français' } as const;
export type Language = keyof typeof LANGUAGES;

const TRANSLATIONS: Record<Language, PartialStrings> = { en, rw, fr };

// Fills the gaps in an unfinished translation from English.
//
// Kinyarwanda is deliberately incomplete — its interface is translated
// and its prose is waiting on a writer — so a visitor reading it must get
// a real English sentence where a Kinyarwanda one does not exist yet,
// never a blank. Arrays are taken whole rather than merged element by
// element: a list half in one language reads as a fault.
function withFallback(base: Strings, overrides: PartialStrings): Strings {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overrides ?? {})) {
        if (value === undefined) continue;
        const fallback = (base as Record<string, unknown>)[key];
        merged[key] =
            value && typeof value === 'object' && !Array.isArray(value)
                ? withFallback(fallback as Strings, value as PartialStrings)
                : value;
    }
    return merged as Strings;
}

const DICTIONARIES: Record<Language, Strings> = {
    en,
    rw: withFallback(en, rw),
    fr: withFallback(en, fr),
};

// How much of a language is actually written, for handing to whoever is
// doing the writing — and so an unfinished translation is a number
// somebody can see rather than something discovered on a live page.
export function coverage(lang: Language): { translated: number; total: number } {
    const count = (value: unknown): number =>
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? Object.values(value).reduce<number>((n, v) => n + count(v), 0)
            : 1;
    const written = (base: unknown, over: unknown): number => {
        if (over === undefined) return 0;
        if (typeof base !== 'object' || base === null || Array.isArray(base)) return 1;
        return Object.entries(base).reduce<number>(
            (n, [k, v]) => n + written(v, (over as Record<string, unknown>)?.[k]), 0);
    };
    return { translated: written(en, TRANSLATIONS[lang]), total: count(en) };
}
const STORAGE_KEY = 'inzira_lang';

export function isLanguage(value: unknown): value is Language {
    return value === 'en' || value === 'rw';
}

// A returning visitor's own choice first, then what their browser asks
// for, then English. Reading navigator.language means a phone set to
// Kinyarwanda gets Kinyarwanda on the first visit without being asked,
// which is the whole point of bothering.
export function preferredLanguage(
    stored: string | null,
    browserLanguages: readonly string[] = []
): Language {
    if (isLanguage(stored)) return stored;
    const asksForKinyarwanda = browserLanguages.some((tag) =>
        tag.toLowerCase().startsWith('rw'));
    return asksForKinyarwanda ? 'rw' : 'en';
}

interface LanguageValue {
    lang: Language;
    setLang: (next: Language) => void;
    t: Strings;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Language>(() => {
        if (typeof window === 'undefined') return 'en';
        return preferredLanguage(
            window.localStorage.getItem(STORAGE_KEY),
            window.navigator.languages ?? [window.navigator.language]
        );
    });

    // The <html lang> attribute is not decoration: it tells a screen
    // reader which pronunciation rules to use, and tells a search engine
    // which language it is indexing. Left at "en" while the page shows
    // Kinyarwanda, both are actively misled.
    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((next: Language) => {
        setLangState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Private browsing can refuse storage. Losing the preference
            // on the next visit is a far smaller problem than throwing
            // while somebody is trying to read the page.
        }
    }, []);

    const value = useMemo(
        () => ({ lang, setLang, t: DICTIONARIES[lang] }),
        [lang, setLang]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// Long-form pages, kept out of the interface dictionary so en.ts stays
// about the interface and a translator can read a whole document in
// order. Kinyarwanda has none yet and falls back to English, exactly as
// the prose in the main dictionary does.
const DOCS = {
    support: { en: supportEn, fr: supportFr, rw: supportEn },
    privacy: { en: privacyEn, fr: privacyFr, rw: privacyEn },
} as const;

export function useSupportDoc() {
    return DOCS.support[useLanguage().lang];
}

export function usePrivacyDoc() {
    return DOCS.privacy[useLanguage().lang];
}

export function useLanguage(): LanguageValue {
    const value = useContext(LanguageContext);
    if (!value) {
        // Falling back to English silently would let a component drift
        // outside the provider and never be noticed until a Kinyarwanda
        // visitor met one English panel in an otherwise translated page.
        throw new Error('useLanguage must be used inside a LanguageProvider');
    }
    return value;
}
