import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from './i18n';
import PricingPage from './PricingPage';
import HowItWorksPage from './HowItWorksPage';
import BusinessPage from './BusinessPage';
import FaqPage from './FaqPage';

// Splitting the landing page into pages introduced a defect that is invisible
// on screen: SectionHead was written for bands *inside* a page, where the hero
// is the h1 and everything under it is correctly an h2. Four of those bands
// became pages, and each one shipped with no h1 at all — its largest heading
// was an h2 with nothing above it.
//
// Nothing looks wrong, which is the problem. It costs a screen-reader user the
// heading they navigate a page by, and a search engine the strongest signal it
// has about what a page is about — the exact thing the split was for. It went
// out to production before anyone noticed, and it took a reader asking about
// the punctuation to find it.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

const PAGES = [
    ['/pricing', <PricingPage onNavigate={vi.fn()} />],
    ['/how-it-works', <HowItWorksPage />],
    ['/business', <BusinessPage />],
    ['/faq', <FaqPage />],
] as const;

describe('every page announces what it is', () => {
    it.each(PAGES.map(([path, el]) => [path, el]))('%s has exactly one h1', (_path, element) => {
        render(inProvider(element as React.ReactElement));
        const h1s = screen.getAllByRole('heading', { level: 1 });
        expect(h1s).toHaveLength(1);
        expect(h1s[0].textContent?.trim().length).toBeGreaterThan(0);
    });

    it('puts the h1 first, above any h2 on the page', () => {
        const { container } = render(inProvider(<FaqPage />));
        const headings = [...container.querySelectorAll('h1, h2, h3')];
        // A page that opens on an h2 and reaches its h1 later is as confusing
        // to navigate as one with no h1 at all.
        expect(headings[0].tagName).toBe('H1');
    });
});
