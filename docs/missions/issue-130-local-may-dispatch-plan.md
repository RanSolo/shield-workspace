# Mission #130 — Governed local-May dispatch sequence

Status: revised for Fury architecture review; no implementation authority

Plan source baseline: `4d60c14`. Fury must review the later exact commit that
contains this revision.

## Decision

Do not implement `shield mission dispatch` yet. At current HEAD, a truthful
schema-9 preflight cannot produce `dispatch_ready`:

- `mission-cli.mts` reads the legacy supervised projection, which rejects the
  canonical schema-9 mission journal;
- `ProfileAwareProjectionV1` does not project runtime bindings, review subjects,
  or Fury reviews;
- no verified positive Wheels Up implementation-authority producer exists;
- May's `approvedFiles` and validation commands remain caller-injected host
  dependencies rather than Coulson-authorized durable mission state.

Converting packet prose, a Hill-authored scope, an effect-key digest, or a pure
test fixture into those missing authorities would change the trust model. This
plan forbids that substitution.

## Required sequence

### Slice A — schema-9 read-only CLI compatibility

Within Issue #130, add a read-only schema discriminator and reader so
`shield mission status|report` can replay canonical schema-9 journals only via
`replayProfileAwareMissionJournal`. Legacy schema 2–8 journals continue through
`replaySupervisedMissionJournal`. Unknown, mixed, malformed, or unsupported
schema input fails closed; neither reader reinterprets the other's projection.

Files:

- update `src/mission-cli.mts` and, if needed, add one internal read-only journal
  projection adapter;
- extend `tests/supervised-cli.test.mjs` with packed schema-9 status/report,
  malformed, mixed-schema, and byte-for-byte journal-immutability cases;
- update CLI documentation only for the repaired status/report behavior.

This slice adds no dispatch command, prompt compiler, runtime binding, Fury
gate, authority projection, model call, tool call, or write path.

### Prerequisite B — verified implementation authority

Issue #141 or a separately reviewed upstream authority contract must provide a
closed, replay-derived positive Wheels Up projection. It must bind signed
Coulson evidence to mission, subject, repository, scope, exact mission and
artifact revisions, journal sequence, lifecycle, May participation, and
dispatch eligibility. #141's current design intentionally supports only
`implementationAuthority: withheld`; that is not sufficient for dispatch.

This prerequisite is outside Slice A and requires its own mission, Fury review,
and Coulson authorization. Governance approval, Wheels Off, `review.publish`,
packet prose, and host assertions cannot substitute for it.

### Prerequisite C — durable May execution scope

Define and separately review a Coulson-signed durable authority contract for the
exact May execution scope. It must explicitly authorize:

- canonical writable repository root and approved relative files;
- action IDs, effect classes, capabilities, and per-call effect-key derivation;
- validation command IDs resolved to fixed host-owned executable/argv records;
- reasoning runtime, model, tool executor, branch, base revision, output
  contract, and one-cycle stop condition.

The contract must compose with existing permission evaluation and
`runMayControlLoop` without treating its own digest as a per-call effect key.
It must define creation, signing, replay, supersession, staleness, and
read-before-dispatch behavior. This is an authority-contract change and is not
part of Slice A.

### Slice D — local-May dispatch preflight

Only after B and C are merged may Issue #130 add:

```text
shield mission dispatch \
  --mission-id <id> \
  --seat may \
  --runtime local \
  --packet <repository-relative-json-file> \
  [--root <path>] \
  [--json]
```

The packet remains untrusted bounded work intent. The CLI replays schema-9
mission state, the positive implementation-authority projection, and the signed
May execution scope; observes canonical root, branch, HEAD, and dirty paths;
loads package-owned shared/May prompts; and compiles a non-authoritative context.
It invokes no model or tool in this slice.

Failure precedence is frozen:

1. malformed or unsupported CLI/packet input;
2. inaccessible or unsafe root, packet, or durable artifact path;
3. malformed, mixed, unsupported, or unreadable mission journal;
4. mission/subject/repository identity mismatch;
5. stale sequence, lifecycle, branch, mission revision, or HEAD;
6. missing or withheld implementation authority;
7. missing, malformed, stale, ambiguous, or mismatched May execution scope;
8. inactive or ineligible May participation/runtime binding;
9. out-of-scope dirty path or requested file;
10. unknown or unapproved validation command;
11. missing or malformed package prompt asset.

Tests must cover each reason and collisions between adjacent precedence classes.
`dispatch_ready` is impossible unless every replayed prerequisite exists and
matches the exact current tuple. Synthetic fixtures may test the pure compiler,
but packed CLI readiness requires the same durable forms used in production.

### Slice E — one governed May cycle

Separately compose `MayControlLoopRequest` and every
`MayControlLoopDependencies` callback, probe the exact loopback model instance,
append and read back audit/control evidence, execute only authorized file writes
and validation IDs, and stop after one cycle. This is not authorized by the
current plan.

## Current implementation boundary

The only presently implementable code slice is Slice A. Stop after its exact
implementation revision passes focused tests and Fury conformance review. Do
not implement B–E, invoke May, push, open or ready a PR, merge, deploy, release,
or claim local-May dispatch readiness under this plan.
