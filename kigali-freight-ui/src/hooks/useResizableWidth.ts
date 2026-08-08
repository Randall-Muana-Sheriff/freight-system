import { useCallback, useRef, useState } from 'react';

interface UseResizableWidthOptions {
    storageKey: string;
    defaultWidth: number;
    min: number;
    max: number;
    // Which edge of the panel the handle sits on — determines which drag
    // direction grows it. 'right' for a panel anchored to the left of the
    // screen (dragging right = wider); 'left' for one anchored to the
    // right (dragging left = wider).
    edge: 'left' | 'right';
}

// The width a collapsed panel still occupies — not zero, so there's a
// visible thin strip with the expand toggle on it rather than the panel
// vanishing without a trace of how to bring it back.
const COLLAPSED_WIDTH = 8;

// Both dashboard side panels (OperationsRail, SecondaryPanel) were a fixed
// Tailwind width class — this makes either one drag-resizable from its
// inner edge, remembering the chosen width per panel across reloads, plus
// a fully-collapsible state (also remembered) for "give me the whole map
// for a moment" without losing the width you'd already dialed in.
export function useResizableWidth({ storageKey, defaultWidth, min, max, edge }: UseResizableWidthOptions) {
    const [width, setWidth] = useState(() => {
        const stored = Number(localStorage.getItem(storageKey));
        return Number.isFinite(stored) && stored >= min && stored <= max ? stored : defaultWidth;
    });
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(`${storageKey}_collapsed`) === '1');
    const dragStart = useRef<{ x: number; width: number } | null>(null);

    const onMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!dragStart.current) return;
            const delta = e.clientX - dragStart.current.x;
            const signedDelta = edge === 'right' ? delta : -delta;
            setWidth(Math.min(max, Math.max(min, dragStart.current.width + signedDelta)));
        },
        [edge, min, max]
    );

    const onMouseUp = useCallback(() => {
        dragStart.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Functional form to read the latest width regardless of when this
        // particular onMouseUp closure was created — onMouseMove has been
        // updating state throughout the drag, this callback's own closure
        // over `width` would otherwise be stale.
        setWidth((current) => {
            localStorage.setItem(storageKey, String(current));
            return current;
        });
    }, [onMouseMove, storageKey]);

    const startResize = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            dragStart.current = { x: e.clientX, width };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },
        [width, onMouseMove, onMouseUp]
    );

    const toggleCollapse = useCallback(() => {
        setCollapsed((current) => {
            const next = !current;
            localStorage.setItem(`${storageKey}_collapsed`, next ? '1' : '0');
            return next;
        });
    }, [storageKey]);

    return { width: collapsed ? COLLAPSED_WIDTH : width, collapsed, toggleCollapse, startResize };
}
