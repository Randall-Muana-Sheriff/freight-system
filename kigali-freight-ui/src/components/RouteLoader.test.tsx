import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteLoader } from './RouteLoader';

describe('RouteLoader', () => {
    it('announces itself as a status, not an alert', () => {
        // A waiting state should not interrupt whatever a screen reader is
        // already reading — polite, not assertive.
        render(<RouteLoader />);
        const status = screen.getByRole('status');
        expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('always has something for a screen reader, even with no visible label', () => {
        render(<RouteLoader />);
        expect(screen.getByText('Loading')).toBeInTheDocument();
    });

    it('shows a caption instead of the hidden text when one is given', () => {
        render(<RouteLoader label="Placing your order" />);
        expect(screen.getByText('Placing your order')).toBeInTheDocument();
        expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    it('draws the brand route rather than a generic shape', () => {
        // The loader is the mark in motion. If this path drifts from
        // InziraMark's, the two stop being the same thing.
        const { container } = render(<RouteLoader />);
        const paths = container.querySelectorAll('path');
        expect(paths.length).toBe(2);
        expect(paths[0].getAttribute('d')).toContain('M108 788C160 812');
        // Both strokes trace the same curve: one is the faint road, the
        // other the part already travelled.
        expect(paths[0].getAttribute('d')).toBe(paths[1].getAttribute('d'));
    });

    it('normalises the path so the dash animation needs no measured length', () => {
        const { container } = render(<RouteLoader />);
        expect(container.querySelector('#inzira-route')).toHaveAttribute('pathLength', '100');
    });

    it('moves the cargo along the real curve, not an approximation', () => {
        const { container } = render(<RouteLoader />);
        const mpath = container.querySelector('mpath');
        expect(mpath).not.toBeNull();
        expect(mpath?.getAttribute('href')).toBe('#inzira-route');
    });

    it('takes the palette of the surface it is on', () => {
        const board = render(<RouteLoader tone="board" />).container;
        expect(board.querySelector('.bg-ink')).not.toBeNull();
        expect(board.querySelector('.fill-route')).not.toBeNull();

        const pub = render(<RouteLoader tone="public" />).container;
        expect(pub.querySelector('.bg-pub-paper')).not.toBeNull();
        expect(pub.querySelector('.fill-pub-laterite')).not.toBeNull();
    });

    it('can sit inside a panel instead of taking the whole screen', () => {
        const { container } = render(<RouteLoader fullScreen={false} />);
        expect(container.querySelector('.h-screen')).toBeNull();
    });
});
