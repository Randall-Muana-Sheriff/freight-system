import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider } from './i18n';
import { Landing } from './Landing';

// The three cards under the hero are the first thing a visitor can click, and
// one of them did nothing at all.
//
// It scrolled to id="business". When the site was split into pages that
// section moved to /business, so getElementById returned null and the
// optional chain swallowed it — no error, no console warning, no navigation.
// A click that goes nowhere is the one kind of dead link that leaves no
// trace, which is why it reached production and stayed there.
//
// So this asserts the property rather than the destination: every entry card
// must DO something observable when clicked.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

describe('the hero entry cards', () => {
    it('every card does something when it is clicked', async () => {
        const user = userEvent.setup();
        const onNavigate = vi.fn();
        // jsdom has no layout, so scrollIntoView is not implemented — stubbing
        // it lets a scrolling card count as having acted, rather than throwing
        // and looking like the dead one.
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        render(inProvider(<Landing onNavigate={onNavigate} />));

        // The cards are the buttons carrying an h2 — the hero's own calls to
        // action are links, and the nav lives in Chrome.
        const cards = screen.getAllByRole('button').filter(
            (b) => b.querySelector('h2') !== null
        );
        expect(cards.length).toBe(3);

        for (const card of cards) {
            onNavigate.mockClear();
            scrollIntoView.mockClear();
            await user.click(card);
            const acted = onNavigate.mock.calls.length > 0 || scrollIntoView.mock.calls.length > 0;
            expect(acted, `"${card.querySelector('h2')?.textContent}" did nothing when clicked`).toBe(true);
        }
    });

    it('standing routes reaches the business page, which is where that section now lives', async () => {
        const user = userEvent.setup();
        const onNavigate = vi.fn();
        Element.prototype.scrollIntoView = vi.fn();

        render(inProvider(<Landing onNavigate={onNavigate} />));
        const standing = screen.getAllByRole('button').find(
            (b) => /standing routes/i.test(b.querySelector('h2')?.textContent ?? '')
        );
        expect(standing, 'the standing routes card should be on the landing page').toBeTruthy();

        await user.click(standing!);
        expect(onNavigate).toHaveBeenCalledWith('/business');
    });
});
