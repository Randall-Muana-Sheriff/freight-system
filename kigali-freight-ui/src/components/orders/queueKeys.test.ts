import { describe, it, expect } from 'vitest';
import { resolveQueueKey, isTypingTarget } from './queueKeys';

// Ids deliberately non-sequential and out of order: an implementation that
// quietly assumes "id === position" passes against [1,2,3] and fails here.
const ids = [704, 12, 391, 88];

describe('resolveQueueKey', () => {
    it('starts at the top on the first keystroke, whichever direction', () => {
        expect(resolveQueueKey('j', ids, null)).toEqual({ kind: 'move', toId: 704 });
        expect(resolveQueueKey('k', ids, null)).toEqual({ kind: 'move', toId: 704 });
    });

    // The assertion my browser check got wrong: it compared row titles, and
    // every row was "General goods", so it would have passed with a cursor
    // that never moved. Positions are the only thing worth asserting.
    it('steps down and back up by position, not by id order', () => {
        expect(resolveQueueKey('j', ids, 704)).toEqual({ kind: 'move', toId: 12 });
        expect(resolveQueueKey('j', ids, 12)).toEqual({ kind: 'move', toId: 391 });
        expect(resolveQueueKey('k', ids, 391)).toEqual({ kind: 'move', toId: 12 });
    });

    it('stops at both ends rather than wrapping', () => {
        expect(resolveQueueKey('k', ids, 704)).toEqual({ kind: 'move', toId: 704 });
        expect(resolveQueueKey('j', ids, 88)).toEqual({ kind: 'move', toId: 88 });
    });

    it('ticks the row under the cursor, and nothing when there is no cursor', () => {
        expect(resolveQueueKey('x', ids, 391)).toEqual({ kind: 'toggle', id: 391 });
        expect(resolveQueueKey('x', ids, null)).toBeNull();
    });

    it('releases the cursor on Escape', () => {
        expect(resolveQueueKey('Escape', ids, 391)).toEqual({ kind: 'release' });
    });

    it('ignores keys it does not own, and an empty queue entirely', () => {
        expect(resolveQueueKey('a', ids, 391)).toBeNull();
        expect(resolveQueueKey('j', [], null)).toBeNull();
    });

    // A cursor pointing at a load that has left the queue — assigned by
    // someone else between renders — must not strand the keyboard. Treated as
    // "no cursor", so the next keystroke starts from the top.
    it('recovers when the cursor points at an order that is gone', () => {
        expect(resolveQueueKey('j', ids, 99999)).toEqual({ kind: 'move', toId: 704 });
    });
});

describe('isTypingTarget', () => {
    it('keeps its hands off anything being typed into', () => {
        for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
            expect(isTypingTarget({ tagName: tag } as unknown as EventTarget)).toBe(true);
        }
        const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
        expect(isTypingTarget(editable)).toBe(true);
    });

    it('claims the keystroke everywhere else', () => {
        expect(isTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
    });
});
