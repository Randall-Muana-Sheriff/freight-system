import { captureException } from './crashReporting';

// For work the caller deliberately does not await, where a rejection would
// otherwise vanish.
//
// The app had 61 of these: promises started and never awaited or caught, or
// async functions handed to props expecting a void return. Some were
// harmless. Several were not — startBackgroundLocationTracking() in
// lib/auth.tsx is awaited by nobody, so if it rejects the driver shows as on
// shift while sending no telemetry at all, and dispatch believes they are
// tracked. A rejected promise with no handler is invisible: no crash, no
// log, no report, and on a phone in the field nobody is watching a console.
//
// `void promise` satisfies the linter and keeps the bug. This is the
// alternative: the intent is stated, and the failure reaches Sentry with a
// label saying where it came from.
//
// Use it when continuing without the result is genuinely correct. When the
// caller needs to know whether the work succeeded — anything the driver is
// waiting on — await it and handle the error instead.
export function fireAndForget(work: Promise<unknown>, context: string): void {
    void work.catch((error: unknown) => {
        captureException(error, { firedFrom: context });
    });
}

// The same thing for props typed to return void, where passing an async
// function is what the no-misused-promises rule objects to: the caller
// discards the promise, so a rejection escapes the same way.
//
//   onPress={handler(() => save(id), 'documents: save')}
export function handler(work: () => Promise<unknown>, context: string): () => void {
    return () => {
        fireAndForget(work(), context);
    };
}
