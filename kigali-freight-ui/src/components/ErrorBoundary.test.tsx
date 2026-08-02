import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

function Bomb(): never {
    throw new Error('Simulated render crash');
}

describe('ErrorBoundary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders children normally when nothing throws', () => {
        render(
            <ErrorBoundary>
                <div>Dashboard content</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    });

    it('catches a render error and shows the fallback instead of crashing the whole page', () => {
        // React logs the caught error to the console by default; silence it
        // for this test so the expected failure doesn't look like a test
        // runner error in output.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText(/Simulated render crash/)).toBeInTheDocument();
    });

    it('reloads the page when the reload button is clicked', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const reloadSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, reload: reloadSpy },
        });

        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        await userEvent.click(screen.getByRole('button', { name: /reload dashboard/i }));
        expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
});
