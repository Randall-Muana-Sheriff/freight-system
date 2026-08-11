import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

describe('useDocumentTitle', () => {
    beforeEach(() => {
        document.title = '';
    });

    it('suffixes the screen name with the product name', () => {
        renderHook(() => useDocumentTitle('Dispatch'));
        expect(document.title).toBe('Dispatch · Inzira');
    });

    it('puts the attention count first so tab truncation cannot hide it', () => {
        renderHook(() => useDocumentTitle('Dispatch', 3));
        expect(document.title).toBe('(3) Dispatch · Inzira');
    });

    it('shows no badge at zero rather than an empty pair of brackets', () => {
        renderHook(() => useDocumentTitle('Dispatch', 0));
        expect(document.title).toBe('Dispatch · Inzira');
    });

    it('retitles when the screen changes', () => {
        const { rerender } = renderHook(({ s }) => useDocumentTitle(s), {
            initialProps: { s: 'Sign in' },
        });
        expect(document.title).toBe('Sign in · Inzira');
        rerender({ s: 'Control centre' });
        expect(document.title).toBe('Control centre · Inzira');
    });

    it('retitles when only the count changes', () => {
        const { rerender } = renderHook(({ n }) => useDocumentTitle('Dispatch', n), {
            initialProps: { n: 0 },
        });
        expect(document.title).toBe('Dispatch · Inzira');
        rerender({ n: 1 });
        expect(document.title).toBe('(1) Dispatch · Inzira');
    });

    it('falls back to the bare product name when no screen is known', () => {
        renderHook(() => useDocumentTitle(''));
        expect(document.title).toBe('Inzira');
    });
});
