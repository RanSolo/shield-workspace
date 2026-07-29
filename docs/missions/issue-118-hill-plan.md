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
- parent mission/session and child task/session identity;
- repository/workspace and exact subject/artifact revisions;
- append-only dispatch lifecycle and host-observed timestamps; and
- input/output evidence references without private reasoning or secrets.

A configured seat, prompt label, model name, or self-report is never sufficient
execution evidence.

## Contract boundary

### Dispatch identity

The first event for a dispatch freezes:

- one receipt ID and dispatch ID;
- parent mission ID and parent session ID;
- child task ID and child session ID;
- one canonical dispatchable `seatId`;
- repository ID, workspace ID, repository revision, subject ID, subject
  revision, and artifact revision;
- configured and requested runtime claims in distinct closed fields;
- optional specialist self-report in its own non-authoritative field;
- host runtime observation as either `observed` with exact identity fields or
  `unavailable` with a closed reason;
- host tool-executor observation as either `observed` with exact identity
  fields or `unavailable` with a closed reason;
- bounded input evidence references; and
- a host-observed start timestamp.

The contract imports the canonical role taxonomy and accepts only dispatchable
seats. Coulson, Fitz, and Simmons always fail closed. Taxonomy membership alone
does not authorize dispatch or tools.

Configured, requested, self-reported, host-observed, and unavailable data use
different discriminated structures. Validation never copies one source into
another or infers a missing host observation.

### Lifecycle

One receipt ID owns one append-only lifecycle. Events use contiguous sequence
numbers and exact prior-event digests. The closed lifecycle events are:

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

Resume preserves the original receipt, dispatch, parent, child, seat,
repository, workspace, mission, subject, and revision identity. It appends a
new host-observed timestamp and may append fresh runtime/executor observations;
it never fabricates uninterrupted continuity.

Completion and other terminal events carry bounded output evidence references.
Entries store references and digests only—never prompts, specialist artifacts,
private reasoning, credentials, or secret values.

### Replay and attribution

Replay validates the closed event shape, event digest, sequence, prior digest,
identity continuity, legal transitions, child identity uniqueness, and receipt
identity uniqueness. It rejects malformed, stale, duplicated, replayed, or
conflicting entries.

A pure attribution evaluator receives:

- an opaque specialist artifact;
- exact expected mission, session, child, seat, repository/workspace, subject,
  and revision identity; and
- replayed receipt evidence.

It returns either:

- `attributed`, with the exact matching completed receipt projection; or
- `unattributed`, with closed reasons and the original opaque artifact
  preserved unchanged.

Missing receipts, non-completed lifecycle, stale revisions, mismatched seats,
wrong sessions, duplicate child identities, conflicting receipts, and
unobserved required host identity all return `unattributed`. The evaluator
does not interpret specialist output, create authority, or determine mission
readiness.

### Durable retrieval

Use one repository-confined append-only log at
`.shield/dispatch-receipts.jsonl`. The store:

- validates the complete candidate replay before writing;
- uses an exclusive lock, append, byte-count check, and file sync;
- refuses symlinked/non-regular targets and repository escape;
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
   - deterministic canonical serialization and SHA-256 entry digests;
   - full append-only replay with identity, sequence, transition, duplicate,
     stale, and conflict checks;
   - canonical dispatchable-seat enforcement through `role-taxonomy-v1`; and
   - the pure artifact-preserving attribution evaluator.
2. Add `src/seat-dispatch-store.mts` containing:
   - fixed repository-relative paths for the dispatch-receipt log and lock;
   - no-follow regular-file reads;
   - repository confinement and symlink rejection;
   - lock/append/sync/readback behavior;
   - full candidate replay before every append; and
   - read-only exact receipt and mission/session/child retrieval.
3. Add the documented `@shield/team-system/dispatch-receipts` package subpath
   and generated declarations.
4. Update `PUBLIC_API.md` with the provenance-only boundary:
   - a receipt proves observed dispatch facts, not authority or readiness;
   - self-report/configuration never substitutes for host observation;
   - human seats never receive automated dispatch receipts;
   - artifacts remain available but unattributed when provenance fails.
5. Add focused contract, replay, attribution, store, package-surface, and packed
   strict-TypeScript-consumer tests.

## Required tests

- Two child sessions using the same model remain distinct by receipt,
  dispatch, task, session, and accountable-seat identity.
- Configured, requested, self-reported, host-observed, and unavailable runtime
  fields remain structurally distinct and cannot substitute for one another.
- Every dispatchable taxonomy seat is representable without enabling it in the
  V0.3 runner; all three human gates are rejected.
- Missing receipt, forged seat label, stale mission/subject/artifact revision,
  wrong repository/workspace, wrong parent or child session, unobserved host
  runtime, non-terminal lifecycle, and conflicting receipt all preserve the
  artifact but return `unattributed`.
- Started, interrupted, resumed, and completed events replay as one lifecycle
  with exact identity continuity and timestamps.
- Illegal transition, post-terminal event, stale prior digest, duplicate
  event, duplicate receipt ID, and child ID reuse across receipts fail closed.
- Failure and cancellation are terminal and never count as completed
  attribution evidence.
- Durable append/read/restart returns byte-equivalent entries and projections.
- A later retrospective session retrieves the original receipt without
  creating or relabeling a dispatch.
- Store lock contention, short/incomplete tail, malformed JSON, symlinked log,
  non-regular target, and repository escape fail closed.
- Existing package imports, role taxonomy, V0.3 runtime enablement, mission
  profiles, and all Mission #130/#131 journals remain unchanged.

## Expected files

- `docs/missions/issue-118-hill-plan.md`
- `packages/shield-team-system/src/seat-dispatch-receipt-v1.mts`
- `packages/shield-team-system/src/seat-dispatch-store.mts`
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
