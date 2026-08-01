# 3. Biometric unlock fails open, not closed

## Context

The driver app's optional biometric unlock (`lib/auth.tsx`,
`confirmBiometric`) gates whether a still-valid refresh token is used to
silently restore a session on cold start. It's purely local — it never
talks to the backend.

## Decision

If the biometric check throws for any reason (missing hardware, no
enrolled biometric, the native module absent from a given build, an
unexpected native exception), the app proceeds as if biometric succeeded,
rather than blocking the driver out of their own session.

## Consequences

- A device where the native call fails gets exactly the security posture
  every driver already has by default — a valid refresh token silently
  restores the session, identical to biometric-gating never having been
  enabled. This does not weaken the PIN, the OTP flow, or server-side
  session/token validity in any way; biometric is a convenience layer on
  top of those, not a replacement for them.
- The alternative (fail closed) would force a full phone → OTP → PIN
  re-login on every affected hardware/OS combination the team doesn't
  fully control — an availability cost paid on every failure, in exchange
  for a security property (specifically biometric, not the underlying
  PIN/session) that was opt-in and cosmetic to begin with.
- See the full comment above `confirmBiometric` in `lib/auth.tsx` for the
  implementation-level detail. Revisit this only as a conscious policy
  change (e.g. if biometric ever gates something more sensitive than
  "restore an already-valid session"), not a bug to patch.
