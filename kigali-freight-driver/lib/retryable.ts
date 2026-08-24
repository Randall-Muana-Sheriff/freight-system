// Whether trying a failed request again could ever produce a different answer.
//
// Its own module, deliberately. This started life inside api.ts and the
// offline queue could not see it: the queue's tests mock './api' wholesale,
// so the single most important decision the queue makes — keep this item or
// discard it — was silently undefined in exactly the tests that cover it.
// A policy that vanishes under test is not a policy.
//
// Duck-typed rather than `error instanceof ApiError`. Metro can hand a module
// out twice, and a Jest mock replaces a class entirely, so identity checks
// here fail for reasons that have nothing to do with the error. What matters
// is whether the thing carries a status, not which constructor made it.
export function isRetryableFailure(error: unknown): boolean {
    const status = (error as { status?: unknown } | null)?.status;

    // No status means we could not classify it — a thrown TypeError, a
    // connection that vanished. Treated as retryable, because re-queueing
    // something we do not understand is recoverable and throwing away a
    // delivery confirmation is not.
    if (typeof status !== 'number') return true;

    // "Not now" rather than "not ever".
    if (status === 408 || status === 429) return true;

    // 5xx is the server having a bad moment. 0 is no response at all.
    // Everything else in 4xx is the server saying the request itself is
    // wrong, and repeating it is how a queue head-of-line blocks for ever.
    return status >= 500 || status === 0;
}
