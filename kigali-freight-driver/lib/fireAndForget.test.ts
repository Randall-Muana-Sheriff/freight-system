import { fireAndForget } from './fireAndForget';
import { captureException } from './crashReporting';

jest.mock('./crashReporting', () => ({
    captureException: jest.fn(),
}));

const mockCapture = captureException as jest.MockedFunction<typeof captureException>;

describe('fireAndForget', () => {
    beforeEach(() => {
        mockCapture.mockClear();
    });

    // The behaviour the whole helper exists for. lib/auth.tsx fires
    // startBackgroundLocationTracking() without awaiting it: if that rejects
    // and nothing catches, the driver is on shift reporting no telemetry and
    // there is no record anywhere that it happened.
    it('reports a rejection instead of letting it vanish', async () => {
        const boom = new Error('location services unavailable');
        fireAndForget(Promise.reject(boom), 'auth: start tracking on hydrate');

        await new Promise((resolve) => setImmediate(resolve));

        expect(mockCapture).toHaveBeenCalledTimes(1);
        expect(mockCapture).toHaveBeenCalledWith(boom, { firedFrom: 'auth: start tracking on hydrate' });
    });

    // The label is the whole point of passing a context string: a stack from
    // a fire-and-forget call is usually just the scheduler, so without it a
    // report says something failed somewhere.
    it('labels the report with where it was fired from', async () => {
        fireAndForget(Promise.reject(new Error('x')), 'auth: flush offline queue on reconnect');
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockCapture.mock.calls[0][1]).toEqual({ firedFrom: 'auth: flush offline queue on reconnect' });
    });

    it('stays quiet when the work succeeds', async () => {
        fireAndForget(Promise.resolve('fine'), 'auth: register push token on hydrate');
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockCapture).not.toHaveBeenCalled();
    });

    // A rejection must not escape as an unhandled rejection either — that is
    // the failure mode this replaces, and on React Native an unhandled
    // rejection can surface as a redbox in development.
    it('does not leave an unhandled rejection behind', async () => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);

        fireAndForget(Promise.reject(new Error('quiet')), 'test');
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });
});
