// src/components/orders/queueKeys.ts — what a keystroke means over the queue.
//
// Extracted from the panel's key handler so it can be tested without mounting
// the whole board. The bug this guards against is one I nearly shipped: my
// first check of j/k compared row TITLES, and every row in the fixture is
// "General goods", so it would have passed whether or not the cursor moved at
// all. Positions are what the assertion has to be about.

export type QueueKeyAction =
    | { kind: 'move'; toId: number }
    | { kind: 'toggle'; id: number }
    | { kind: 'release' }
    | null;

/** Whether a keystroke belongs to whatever is being typed into rather than to
 *  the queue. A dispatcher writing "remera" into the filter must not have the
 *  j silently step the cursor instead. */
export function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

/**
 * j and k step, x ticks a row for a bulk action, Escape lets go.
 *
 * j/k rather than the arrow keys because the arrows already scroll the panel,
 * and because someone who lives at this desk should not leave the home row to
 * walk a list.
 *
 * Movement is expressed as the id to land on, never as an index, so a refresh
 * that reorders the queue underneath cannot silently move the cursor onto a
 * different load.
 */
export function resolveQueueKey(
    key: string,
    orderIds: number[],
    cursorId: number | null,
): QueueKeyAction {
    if (orderIds.length === 0) return null;
    const at = cursorId === null ? -1 : orderIds.indexOf(cursorId);

    const step = (delta: number): QueueKeyAction => {
        // Nothing focused yet: j and k both start at the top rather than
        // doing nothing, because a first keystroke that appears to be ignored
        // reads as the feature being broken.
        if (at === -1) return { kind: 'move', toId: orderIds[0] };
        const next = Math.min(orderIds.length - 1, Math.max(0, at + delta));
        return { kind: 'move', toId: orderIds[next] };
    };

    if (key === 'j') return step(1);
    if (key === 'k') return step(-1);
    if (key === 'x') return at === -1 ? null : { kind: 'toggle', id: orderIds[at] };
    if (key === 'Escape') return { kind: 'release' };
    return null;
}
