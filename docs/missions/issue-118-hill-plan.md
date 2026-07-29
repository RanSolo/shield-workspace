# Issue #118 — Durable Seat Dispatch Receipt Plan

## Mission identity

- Issue: `#118`
- Mission: `mission:issue-118-seat-dispatch-receipts-v1`
- Base revision: `5fb43a98e149cf4f44bb432f3b0b9ca1d3d3e83d`
- Predecessor: Issue #124 merge commit and canonical role taxonomy
- Profile: `standard@1`
- Implementation owner: May
- Validation owner: Mack
- Architecture gates: Fury plan review and exact-head conformance review
- Human authority: Coulson

The user authorized Issues #124 and #118 to run back-to-back. That authorizes
planning and bounded implementation/publication of a draft review artifact. It
does not provide final acceptance, merge, deployment, release, or permission
widening.

This mission does not alter the completed Mission #130 or #131 journals.

## Objective

Add the smallest closed, versioned, durable host receipt that proves a
dispatchable SHIELD seat actually ran. Preserve separate evidence for:

- accountable seat;
- configured runtime binding;
- requested runtime/model configuration;
- specialist self-report;
- host-observed runtime identity or explicit unavailability;
- host-observed tool executor identity or explicit unavailability;
- parent mission/session/revision and child task/session identity;
- repository/workspace, exact subject identity/revision, and exact artifact
  identity/revision;
- append-only dispatch lifecycle and host-observed timestamps; and
- input/output evidence references without private reasoning or secrets.

A configured seat, prompt label, model name, or self-report is never sufficient
execution evidence.

## Contract boundary

### Dispatch identity

The first event for a dispatch freezes:

- one receipt ID and dispatch ID;
- parent mission ID, parent mission revision, and parent session ID;
- child task ID and child session ID;
- one canonical dispatchable `seatId`;
- repository ID, workspace ID, repository revision, subject ID, subject
  revision, artifact ID, and artifact revision;
- configured and requested runtime claims in distinct closed fields;
- whether tool execution was not requested or was requested with an exact
  executor-binding reference;
- only self-report and host runtime/executor observations actually available
  at dispatch start, each in its own source-specific field;
- bounded input evidence references; and
- a host-observed start timestamp.

The contract imports the canonical role taxonomy and accepts only dispatchable
seats. Coulson, Fitz, and Simmons always fail closed. Taxonomy membership alone
does not authorize dispatch or tools.

Configured, requested, self-reported, host-observed, and unavailable data use
different discriminated structures. Validation never copies one source into
another or infers a missing host observation.

Artifact ID and artifact revision are separate required identifiers. A revision
may be content-addressed, but it never substitutes for artifact identity.

### Lifecycle

One receipt ID owns one append-only lifecycle inside one interleaved
repository log. Every event therefore carries two independent chains:

- globally contiguous `logSequence` and `previousLogDigest`; and
- per-receipt contiguous `lifecycleSequence` and
  `previousLifecycleDigest`.

`receiptId` and `dispatchId` have one globally unique one-to-one mapping. Each
child task ID and each child session ID globally belongs to exactly one receipt.
Repeating the receipt identity on its later lifecycle events is required and is
not a duplicate. Replay distinguishes duplicate event digest, duplicate start,
conflicting receipt/dispatch mapping, conflicting child mapping, stale global
chain, and stale lifecycle chain.

The closed lifecycle events are:

- `dispatch.started`;
- `dispatch.interrupted`;
- `dispatch.resumed`;
- `dispatch.completed`;
- `dispatch.failed`; and
- `dispatch.cancelled`.

Started may transition to interrupted, completed, failed, or cancelled.
Interrupted may transition only to resumed, failed, or cancelled. Resumed may
transition to interrupted, completed, failed, or cancelled. Terminal states do
not transition.

Resume preserves the original receipt, dispatch, parent mission/session/
revision, child, seat, repository, workspace, subject, artifact, and revision
identity. It never fabricates uninterrupted continuity.

Interruption, resume, and every terminal event append their own host timestamp
and may append newly available specialist self-report, host runtime observation,
and host executor observation. Observations are immutable history: later events
never overwrite or backdate earlier values. Event timestamps must not precede
the prior lifecycle timestamp.

Completion and other terminal events carry bounded output evidence references.
Entries store references and digests only—never prompts, specialist artifacts,
private reasoning, credentials, or secret values.

Attribution requires at least one exact host-observed runtime identity in the
lifecycle. Runtime `unavailable` remains unattributed. When tool execution was
requested, attribution also requires an exact host-observed executor identity.
When tool execution was not requested, executor `unavailable:not_applicable`
is permitted and cannot be promoted into an observed identity. Other executor
unavailability remains unattributed.

Each event is closed strict JSON: no undefined values, non-finite numbers,
accessors, proxies, sparse arrays, symbols, or non-JSON objects. Its
`entryDigest` is lowercase SHA-256 over UTF-8 bytes of:

`shield.seat-dispatch.event.v1\n` followed by deterministic canonical JSON of
the complete event excluding only `entryDigest`.

### Replay and attribution

Replay validates the closed event shape, event digest, both sequence/digest
chains, identity continuity, timestamp ordering, legal transitions, child
identity uniqueness, and receipt/dispatch identity mapping. It rejects
malformed, stale, duplicated, replayed, or conflicting entries.

A pure attribution evaluator receives:

- an opaque specialist artifact;
- exact expected mission ID/revision/session, child, seat,
  repository/workspace/revision, subject ID/revision, and artifact
  ID/revision identity; and
- raw unknown receipt entries or the complete valid/invalid replay result.

The evaluator invokes replay itself for raw entries and can therefore classify
malformed or conflicting provenance. It does not require callers to manufacture
a valid projection from invalid evidence.

It returns either:

- `attributed`, with the original artifact by reference and exactly one matching
  completed receipt projection; or
- `unattributed`, with the original artifact by reference and closed,
  deterministic reason codes.

The evaluator never clones, serializes, hashes, enumerates, or otherwise
inspects the artifact.

Missing receipts, non-completed lifecycle, stale revisions, mismatched seats,
wrong sessions, duplicate child identities, conflicting receipts, and
unobserved required host identity all return `unattributed`. The evaluator
does not interpret specialist output, create authority, or determine mission
readiness.

### Durable retrieval

Use one repository-confined append-only log at
`.shield/dispatch-receipts.jsonl`. The store:

- validates the complete candidate replay before writing;
- binds every operation to expected repository ID, workspace ID, and canonical
  repository root and rejects mixed-scope entries;
- rejects symlinked/non-directory `.shield` path components before opening
  targets;
- opens both log and lock with no-follow semantics and verifies regular-file
  handles;
- writes and syncs a host-supplied unique lock-owner token, records the lock
  handle device/inode, and unlinks only when path identity and token still
  match, so cleanup cannot remove another owner's lock;
- uses append, exact byte-count checks, and data-file sync;
- syncs the parent directory after first log creation;
- performs exact-byte readback and complete replay after sync before returning
  success;
- refuses repository escape, symlinked lock/log targets, and non-regular
  targets;
- returns `recovery_required` for malformed or incomplete tails;
- exposes read-only retrieval by receipt ID, parent mission/session, and child
  task/session;
- preserves original entries across later sessions; and
- never creates a retrospective receipt when querying prior execution.

The repository-scoped log provides cross-session retrieval without changing
mission-journal schemas.

## Implementation plan

1. Add `src/seat-dispatch-receipt-v1.mts` containing:
   - schema and contract version constants;
   - closed discriminated configured/requested/self-reported/host-observed
     runtime and executor structures;
   - immutable event and projection types;
   - exact identifier, revision, timestamp, evidence-reference, and digest
     validation;
   - dispatch-start and lifecycle-event constructors;
   - domain-separated deterministic canonical serialization and SHA-256 entry
     digests;
   - full append-only replay with global and lifecycle identity, sequence,
     transition, timestamp, duplicate, stale, and conflict checks;
   - canonical dispatchable-seat enforcement through `role-taxonomy-v1`; and
   - the pure artifact-preserving attribution evaluator.
2. Add `src/seat-dispatch-store.mts` containing:
   - fixed repository-relative paths for the dispatch-receipt log and lock;
   - no-follow regular-file reads;
   - canonical repository and store-scope identity validation;
   - parent-component, log, and lock confinement/symlink rejection;
   - ownership-safe lock, append, file/directory sync, and exact readback
     behavior;
   - full candidate replay before every append; and
   - read-only exact receipt and mission/session/child retrieval.
3. Add `src/dispatch-receipts.mts` as the only public facade. Freeze dependency
   direction as:

   `dispatch-receipts facade → seat-dispatch-store → seat-dispatch-receipt-v1 → role-taxonomy-v1`

   The facade may also directly re-export the receipt contract. No reverse edge
   is permitted.
4. Point the documented `@shield/team-system/dispatch-receipts` package subpath
   at the facade and generated declaration.
5. Update `PUBLIC_API.md` with the provenance-only boundary:
   - a receipt proves observed dispatch facts, not authority or readiness;
   - self-report/configuration never substitutes for host observation;
   - human seats never receive automated dispatch receipts;
   - artifacts remain available but unattributed when provenance fails.
6. Add focused contract, replay, attribution, store, package-surface, and packed
   strict-TypeScript-consumer tests.

## Required tests

- Two child sessions using the same model remain distinct by receipt,
  dispatch, task, session, and accountable-seat identity, covering both the
  same accountable seat and different accountable seats.
- Configured, requested, self-reported, host-observed, and unavailable runtime
  fields remain structurally distinct and cannot substitute for one another.
- Every dispatchable taxonomy seat is representable without enabling it in the
  V0.3 runner; all three human gates are rejected.
- Missing receipt, malformed raw log, forged seat label, stale mission/subject/
  artifact revision, wrong artifact ID, wrong repository/workspace, wrong
  parent or child session, unobserved host runtime, requested-but-unobserved
  executor, non-terminal lifecycle, and conflicting receipt all preserve the
  same artifact reference but return deterministic `unattributed` reasons.
- Started, interrupted, resumed, and completed events replay as one lifecycle
  with exact identity continuity, ordered timestamps, and append-only
  observation history. An uninterrupted completion can first report runtime,
  executor, or self-reported identity without backdating it to start.
- Illegal transition, post-terminal event, stale global digest, stale lifecycle
  digest, duplicate event, duplicate start, conflicting receipt/dispatch
  mapping, and child task/session reuse across receipts fail closed.
- Failure and cancellation are terminal and never count as completed
  attribution evidence.
- Durable append/read/restart returns byte-equivalent entries and projections.
- A fresh later process/session retrieves the original receipt without creating
  or relabeling a dispatch, and before/after log bytes are identical.
- Store lock contention, concurrent stale append, short/incomplete tail,
  malformed JSON, symlinked `.shield` parent, symlinked/non-regular log,
  symlinked/non-regular lock, mixed repository/workspace scope, and repository
  escape fail closed.
- Runtime facade exports, packed declarations, strict consumer imports, and the
  complete source import graph prove the frozen one-way dependency direction.
- Existing package imports, role taxonomy, V0.3 runtime enablement, mission
  profiles, and all Mission #130/#131 journals remain unchanged.

## Expected files

- `docs/missions/issue-118-hill-plan.md`
- `packages/shield-team-system/src/seat-dispatch-receipt-v1.mts`
- `packages/shield-team-system/src/seat-dispatch-store.mts`
- `packages/shield-team-system/src/dispatch-receipts.mts`
- `packages/shield-team-system/tests/seat-dispatch-receipt-v1.test.mjs`
- `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/PUBLIC_API.md`

May may narrow tests or combine test files, but may not broaden source
integration beyond this list without returning to Fury.

## Validation

- TypeScript build.
- Focused receipt, replay, attribution, store, role, and package-surface tests.
- Full `@shield/team-system` package suite.
- Packed strict TypeScript consumer.
- Overall baseline `git diff --check`.
- Byte/digest comparison for all existing `.shield/journals`.

## Non-goals and stop conditions

Stop and return to Fury if implementation would:

- integrate the receipt into the Issue #117 admission gate;
- add a router, scheduler, provider registry, or persistent model memory;
- store specialist content, prompts, chain-of-thought, secrets, or credentials;
- create or infer human authority evidence;
- widen tool permission, merge, deployment, release, or publication authority;
- enable Mack or Oracle in V0.3 runtime paths;
- mutate an existing mission or journal schema;
- treat configuration, request, model self-report, or a generated thread label
  as host-observed execution;
- discard a specialist artifact solely because attribution fails; or
- introduce a dependency cycle.

After exact-head Mack validation and Fury conformance approval, publish a draft
PR and stop for Coulson review.
