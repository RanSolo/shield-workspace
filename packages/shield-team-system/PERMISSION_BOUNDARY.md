# Runtime binding and permission boundary

Issue #10 separates responsibility from operational identity:

- `seatId` identifies mission responsibility and authority.
- `reasoningRuntimeId` identifies the runtime performing reasoning.
- `toolExecutorId` identifies the host or runtime actually invoking tools.

Runtimes and executors are not seats and inherit no seat authority. Coulson,
Fitz, and Simmons are human-only seats and cannot receive runtime bindings.

## Authoritative state

Supervised journal v6 adds homogeneous `runtime.binding_recorded` and
`runtime.binding_superseded` entries. Each entry contains a closed runtime
binding and separate Ed25519 Coulson authorization over the exact binding,
prior identity, mission and subject, artifact revision, and next sequence.
Replay derives the single active binding for each seat. Supersession replaces
the prior binding atomically; a runtime change is never automatic.

The Mission Journal is the authoritative record of governance and binding
state. Journal v2-v5 behavior remains supported without reinterpretation.

## Per-call enforcement

`@shield/team-system/permission` supplies a pure deny-by-default evaluator and
adapters for the Issue #8 runner seam. Every call exact-matches mission,
subject, seat, runtime, executor, binding ID/version, repository and canonical
writable root, branch, mission and artifact revisions, journal sequence,
action, effect class/key, approved scope, required capabilities, and fresh
host-observed attestations.

Capability, repository-root, and writability attestations prove operational
facts only. They do not grant authority, readiness, or permission. Issue #34
owns real broker and probe production; this package validates supplied evidence.

The authorizer writes a closed decision record through atomic
`appendIfAbsent` and verifies the exact receipt before returning `allow`.
Decision IDs are single-use. The audited executor obtains a fresh context and
revalidates the exact decision immediately before dispatch. Missing, stale,
malformed, ambiguous, substituted, mismatched, reused, or out-of-scope inputs
fail closed without invoking the tool.

## Audit boundary

`@shield/team-system/permission-audit` defines a separate append-only,
digest-bound ledger for permission decisions and sanitized tool results. The
records preserve truthful seat/runtime/executor attribution and exclude raw
tool output, secrets, and private reasoning. A tool result can follow only its
exact preceding allow decision. An unverified result receipt becomes
`uncertain`.

The audit ledger is non-authoritative derived operational evidence. It cannot
grant permission, mutate or supersede journal state, or change governance or
readiness.
