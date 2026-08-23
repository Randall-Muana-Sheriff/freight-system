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
    // The chrome renders on every page, and what a link *does* now depends
    // on which page that is: a destination on the current page scrolls, one
    // elsewhere routes. Most of these assert the routing half, so they start
    // somewhere that is not the landing page — jsdom otherwise sits at "/"
    // and every home-page link correctly declines to navigate.
    history.pushState({}, '', '/support');
    Element.prototype.scrollIntoView = scrollSpy;
    scrollSpy.mockClear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
    });
});

afterEach(() => {
    history.pushState({}, '', '/');
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

describe('navigation destinations', () => {
    // The site stopped being one page. Most destinations are now routes,
    // two are still sections — services on the home page and the contact
    // form at the foot of every content page — and one is both: "The
    // system" is a section of /how-it-works, so it has to navigate first
    // and scroll once the page has mounted.
    it('sends a page link to the router rather than scrolling', async () => {
        const onNavigate = vi.fn();
        render(inProvider(<PublicFooter onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Standing routes'));

        expect(onNavigate).toHaveBeenCalledWith('/business');
        // It used to scroll to the contact form, which answered a
        // different question than the link asked.
        expect(scrollSpy).not.toHaveBeenCalled();
    });

    it('scrolls in place for a section that is on this page', async () => {
        history.pushState({}, '', '/');   // the landing page, where the form lives
        const target = withSection('contact');
        const onNavigate = vi.fn();
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Talk to us'));

        expect(scrollSpy.mock.instances[0]).toBe(target);
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('routes home first when the form is on another page', async () => {
        // Started from /support by the harness. The contact form lives on
        // the landing page alone — it was briefly repeated at the foot of
        // every page, which read as a footer rather than an invitation.
        const onNavigate = vi.fn(() => { withSection('contact'); });
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        await userEvent.click(screen.getByText('Talk to us'));

        expect(onNavigate).toHaveBeenCalledWith('/');
        expect(scrollSpy).toHaveBeenCalled();
    });

    it('goes to the page first when the section lives on another one', async () => {
        // The state on /order, /track and /support, where the services
        // band does not exist at all. Started from /support above.
        const onNavigate = vi.fn();
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        await userEvent.click(screen.getByRole('button', { name: 'What we do' }));
        await userEvent.click(screen.getByText('What we move'));

        expect(onNavigate).toHaveBeenCalledWith('/');
    });

    it('scrolls once the page it navigated to has rendered the section', async () => {
        // Mimics the real sequence: navigate, then the section appears a
        // frame later. The retry has to survive that gap.
        const onNavigate = vi.fn(() => { withSection('system'); });
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        await userEvent.click(screen.getByRole('button', { name: 'How it works' }));
        await userEvent.click(screen.getByText('The system'));

        expect(onNavigate).toHaveBeenCalledWith('/how-it-works');
        expect(scrollSpy).toHaveBeenCalled();
    });

    it('gives up rather than looping when the section never appears', async () => {
        const onNavigate = vi.fn();
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        // requestAnimationFrame is synchronous here, so an unbounded retry
        // would hang the test rather than fail it.
        await userEvent.click(screen.getByRole('button', { name: 'How it works' }));
        await userEvent.click(screen.getByText('The system'));

        expect(scrollSpy).not.toHaveBeenCalled();
    });

    // The two categories and where each item goes. Written out rather than
    // imported from NAV, deliberately: a test that reads the same list the
    // component reads passes whatever that list says, including after
    // somebody drops an item from it by accident.
    const MENUS = [
        ['What we do', [['What we move', '/'], ['Pricing', '/pricing'], ['For business', '/business']]],
        ['How it works', [['What happens to your cargo', '/how-it-works'], ['The system', '/how-it-works'], ['Common questions', '/faq']]],
    ] as const;

    it('every header nav link resolves, from any page', async () => {
        const onNavigate = vi.fn();
        render(inProvider(<PublicHeader onNavigate={onNavigate} />));

        for (const [category, items] of MENUS) {
            for (const [label, path] of items) {
                // Reopened each time: choosing a destination closes the menu.
                await userEvent.click(screen.getByRole('button', { name: category }));
                onNavigate.mockClear();
                await userEvent.click(screen.getByText(label));
                expect(onNavigate, `"${label}" went nowhere`).toHaveBeenCalledWith(path);
            }
        }

        // The one flat entry. It is a section of the landing page, so from
        // anywhere else it routes there first.
        onNavigate.mockClear();
        await userEvent.click(screen.getByText('Talk to us'));
        expect(onNavigate, '"Talk to us" went nowhere').toHaveBeenCalledWith('/');
    });

    it('keeps each category shut until it is asked for', async () => {
        render(inProvider(<PublicHeader onNavigate={vi.fn()} />));

        for (const [category, items] of MENUS) {
            const button = screen.getByRole('button', { name: category });
            expect(button).toHaveAttribute('aria-expanded', 'false');
            expect(screen.queryByText(items[0][0])).toBeNull();

            await userEvent.click(button);
            expect(button).toHaveAttribute('aria-expanded', 'true');
            expect(screen.getByText(items[0][0])).toBeTruthy();

            await userEvent.click(button);
            expect(screen.queryByText(items[0][0])).toBeNull();
        }
    });

    it('closes on Escape rather than trapping the keyboard in it', async () => {
        render(inProvider(<PublicHeader onNavigate={vi.fn()} />));

        const button = screen.getByRole('button', { name: 'What we do' });
        await userEvent.click(button);
        expect(screen.getByText('Pricing')).toBeTruthy();

        await userEvent.keyboard('{Escape}');

        expect(screen.queryByText('Pricing')).toBeNull();
        // Focus goes back to the button, or the keyboard is left standing
        // in a panel that no longer exists.
        expect(document.activeElement).toBe(button);
    });
});
