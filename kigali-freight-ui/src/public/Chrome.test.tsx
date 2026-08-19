import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicHeader, PublicFooter } from './Chrome';
import { LanguageProvider } from './i18n';

// The chrome reads its labels from the language context and throws
// without one — deliberately, so a component cannot drift outside the
// provider and be found later by a Kinyarwanda visitor meeting one
// English panel. Tests have to supply it like the app does.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

// jsdom has no layout, so scrollIntoView is not implemented on elements.
// Stubbing it is what lets us assert *which* element a link resolved to.
const scrollSpy = vi.fn();

beforeEach(() => {
    Element.prototype.scrollIntoView = scrollSpy;
    scrollSpy.mockClear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    // Testing Library cleans up its own container, but not sections
    // appended by hand — and one left behind makes the next test think it
    // is already on the landing page.
    added.forEach((el) => el.remove());
    added.length = 0;
});

const added: HTMLElement[] = [];

function withSection(id: string) {
    const section = document.createElement('section');
    section.id = id;
    document.body.appendChild(section);
    added.push(section);
    return section;
}

describe('section links', () => {
    it('scrolls in place when the section is on this page', async () => {
        const target = withSection('contact');
        const onNavigate = vi.fn();
        render(inProvider(<PublicFooter onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Standing routes'));

        expect(scrollSpy).toHaveBeenCalled();
        expect(scrollSpy.mock.instances[0]).toBe(target);
        // Already home — no reason to navigate anywhere.
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('goes home first when the section is not on this page', async () => {
        // The state on /order, /track, /privacy and /support, where this
        // used to do nothing at all.
        const onNavigate = vi.fn();
        render(inProvider(<PublicFooter onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Standing routes'));

        expect(onNavigate).toHaveBeenCalledWith('/');
    });

    it('scrolls once the landing page has rendered the section', async () => {
        // Mimics the real sequence: navigate, then the section appears a
        // frame later. The retry has to survive that gap.
        const onNavigate = vi.fn(() => { withSection('contact'); });
        render(inProvider(<PublicFooter onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Standing routes'));

        expect(onNavigate).toHaveBeenCalledWith('/');
        expect(scrollSpy).toHaveBeenCalled();
    });

    it('gives up rather than looping when the section never appears', async () => {
        const onNavigate = vi.fn();
        render(inProvider(<PublicFooter onNavigate={onNavigate} />));

        // requestAnimationFrame is synchronous here, so an unbounded retry
        // would hang the test rather than fail it.
        await userEvent.click(screen.getByText('Standing routes'));

        expect(scrollSpy).not.toHaveBeenCalled();
    });

    it('every header nav link resolves, from any page', async () => {
        const onNavigate = vi.fn();
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        for (const label of ['What we move', 'How it works', 'The system', 'Talk to us']) {
            onNavigate.mockClear();
            await userEvent.click(screen.getByText(label));
            expect(onNavigate, `"${label}" did nothing`).toHaveBeenCalledWith('/');
        }
    });
});
