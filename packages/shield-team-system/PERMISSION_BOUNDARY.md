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
Journal v7 carries the complete v6 runtime-binding contract forward unchanged
while adding review-revision lifecycle state in the supervision boundary.
Journal v8 preserves those contracts and adds Coulson-signed
`review.publication_authorized` records plus publication-bound adapter v2
communication records.

## Per-call enforcement

`@shield/team-system/permission` supplies a pure deny-by-default evaluator and
adapters for the Issue #8 runner seam. Every call exact-matches mission,
subject, seat, runtime, executor, binding ID/version, repository and canonical
writable root, branch, mission and artifact revisions, journal sequence,
action, effect class/key, approved scope, required capabilities, and fresh
host-observed attestations.

Permission context v1 accepts supervised journal v6, v7, or v8. Admission of
newer journals
does not widen action, effect, path, capability, identity, or attestation
authority; all existing exact-match checks remain mandatory.

## Review-publication boundary

`@shield/team-system/review-publication` is an additional pure permission input
for repository review effects. The authority is not caller asserted: a trusted
Coulson binding signs the exact authority digest into the durable v8 journal.
A closed authority names the exact mission,
subject, repository, canonical root, branch, base/head revisions, authorized
repository-relative paths, and permitted effects. A host observation must
match those paths exactly and must prove a clean committed workspace without
authorized-path symlinks or gitlinks before an effect is eligible.

Before any effect, the host adapter loads and fully replays that journal,
selects exactly one queued adapter-v2 request, and resolves its referenced
authorization. Standalone requests or caller-created projections cannot
authorize publication. The request also binds the exact operation and target:
review comments exact-match the PR number, while draft-PR publication
exact-matches repository, mission branch, base branch, and the host-observed
live remote base revision.

`review.publish` and Wheels Up use the same evaluator; Wheels Up does not widen
the approved paths or effects. The GitHub adapter observes the repository and
evaluates this contract before branch push, draft-PR creation/update, or review
comment publication. GitHub transports an allowed decision but does not define
authority meaning. Missing, malformed, stale, dirty, sensitive, ambiguous, or
out-of-scope evidence fails closed before the external effect.

Every scoped effect attempt returns an adapter-v2 communication-result
candidate, including Delivery Workspace and post-effect transport/readback
failures. Result replay exact-matches request ID, operation, target, scope, and
effects before the queued request can become final evidence.
The exact candidate identity and unused candidate ID are validated against the
replayed journal before any effect.

Capability, repository-root, and writability attestations prove operational
facts only. They do not grant authority, readiness, or permission. Issue #34
owns real broker and probe production; this package validates supplied evidence.

The authorizer writes a closed decision record through atomic
`appendIfAbsent` and verifies the exact receipt before returning `allow`.
Decision IDs are single-use. The audited executor obtains a fresh context,
revalidates the exact decision, and atomically appends a deterministic
invocation-consumption record immediately before dispatch. Missing, stale,
malformed, ambiguous, substituted, mismatched, reused, or out-of-scope inputs
fail closed without invoking the tool.

## Audit boundary

`@shield/team-system/permission-audit` defines a separate append-only,
digest-bound ledger for permission decisions and sanitized tool results. The
designated ledger identity is carried by every record and verified receipt;
cross-ledger receipts fail closed. Records preserve truthful
seat/runtime/executor attribution and exclude raw
tool output, secrets, and private reasoning. A tool result can follow only its
exact preceding allow decision. An unverified result receipt becomes
`uncertain`.

The audit ledger is non-authoritative derived operational evidence. It cannot
grant permission, mutate or supersede journal state, or change governance or
readiness.
