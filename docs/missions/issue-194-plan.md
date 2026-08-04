# Issue #194 — governed May temporary-name correction plan

## Review identity

- Mission: `mission:issue-194`
- Mission revision: `sha256:JXhV5GMcRkuFQ-sL4qChIMw-iZUpK9WBidgY1GTk5FU`
- Subject: `github:RanSolo/shield-workspace/issue/194`
- Base revision: `75cbe9974bab03c851601cde8e9249a63c384c0c`
- Branch: `agent/issue-194-temp-name`
- Accountable plan owner: Hill
- Intended implementation seat after approval: May
- Status: planning only; no production edit, #137 external run, or #29 work has started

## Verified defect

`runGovernedMayDispatchStepV1` currently passes a zero-argument
`nextTemporaryName` returning `may-control-${++temporaryCounter}.tmp` to the
real May control loop. `runMayToolCall` invokes that function with the exact
`sessionId` and `toolCallId`, then accepts only
`.shield-may-[A-Za-z0-9_-]{8,64}.tmp`. Every real governed write therefore
fails with `may_temporary_name_invalid` before file creation.

The existing governed-dispatch suite replaces `runMayControlLoop` with an
in-memory simulator. The existing executor suite supplies an already-valid
`.shield-may-12345678.tmp`. Both components are tested, but their production
composition is not.

## Local May planning evidence

Bionic-hosted Gemma 4 31B received a 297-input-token micro packet and used 721
reasoning tokens. It independently selected a SHA-256 identity derived from
the session and tool-call IDs and recommended a real dispatcher/control-loop/
executor integration test. Hill retained that algorithm, rejected Gemma's
invented integration-test directory, and bound the test to the repository's
existing `governed-may-dispatch-v1.test.mjs` conventions.

## Frozen implementation

### Bootstrap executor choice

Local Bionic/Gemma May supplied the bounded implementation design, but it
cannot truthfully perform this mission's repository write through
`runGovernedMayDispatchStepV1`: the temporary-name composition corrected by
this issue makes that exact path fail before the first write. After Fury
approval and signed Wheels Up, hosted May therefore performs the two-path
implementation under the same May seat contract. This is a fail-closed
bootstrap choice, not a new authority class or scope widening. Governed local
May execution resumes only after this correction is merged and #137 is
re-frozen from fresh main.

### Production correction

In `packages/shield-team-system/src/governed-may-dispatch-v1.mts`:

- remove the unused `temporaryCounter`;
- replace the temporary-name callback with a pure callback accepting the
  executor-supplied `{ sessionId, toolCallId }`;
- derive the middle identity as base64url SHA-256 over the domain-separated,
  unambiguous byte sequence
  `shield:may-temporary:v1\0${sessionId}\0${toolCallId}`;
- return `.shield-may-${digest}.tmp`.

The full SHA-256 base64url digest is 43 safe characters, so the final name
matches the executor's existing closed regex without changing that contract.
The same child session and tool call produce the same name; different session
or call IDs produce different names. Existing `O_EXCL`, `O_NOFOLLOW`, target
confinement, precondition recheck, cleanup, and uncertain-effect behavior are
unchanged. A stale same-call temporary file remains a collision and fails
closed rather than silently selecting a new name.

### Real-composition regression test

In `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`, add one
focused integration test that:

1. creates a disposable temporary Git repository and a dynamic exact authority
   projection bound to its canonical root and HEAD;
2. freezes an absent write operation and a shell-free Node validation operation
   with the real executable identity and exact effect keys;
3. calls the production `runGovernedMayDispatchStepV1`;
4. supplies the production `runMayControlLoop`, with only `fetchImpl` replaced
   by deterministic loopback response objects for model discovery, one write
   call, one validation call, and the final May message;
5. allows the production `runMayToolCall`/filesystem executor to perform the
   exact write and validation in the disposable repository;
6. asserts literal dispatcher completion, exact target bytes, one ordered write
   and validation, and no remaining `.shield-may-*.tmp` file.

The test must fail on the base revision with `may_temporary_name_invalid` and
pass with the correction. It must not call LM Studio, GitHub, or any external
network, and it must not weaken or duplicate lower-level executor tests.

## Exact writable paths

- `packages/shield-team-system/src/governed-may-dispatch-v1.mts`
- `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`

No executor, authority, journal, receipt, permission, CLI, fixture, public API,
or external-run path is in implementation scope. This plan and the May
blueprint remain immutable during implementation.

## Validation

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

## Stop and review sequence

1. Commit this plan and the May blueprint without production changes.
2. Fury reviews the exact planning revision.
3. On `FURY_REVISE`, correct only planning artifacts and return the new exact
   revision to the same Fury seat.
4. On `FURY_PASS`, obtain signed Wheels Up for exactly the two implementation
   paths before May edits them.
5. May implements the approved plan and stops at an exact revision.
6. Mack validates that exact revision; Fury performs exact-revision conformance
   review.
7. Open one bounded draft PR for human review. Do not merge, run #137's external
   fixture, or enter #29.
