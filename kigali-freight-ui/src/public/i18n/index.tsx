import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type Strings } from './en';
import { rw } from './rw';

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

export const LANGUAGES = { en: 'English', rw: 'Ikinyarwanda' } as const;
export type Language = keyof typeof LANGUAGES;

const DICTIONARIES: Record<Language, Strings> = { en, rw };
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
