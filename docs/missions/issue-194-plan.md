# Issue #194 — governed May temporary-name correction plan

## Review identity

- Mission: `mission:issue-194-hosted-sol`
- Mission revision: `sha256:-FCsf2I2oUYYxxma4ETLyh_YAVClJdvu9CQgaKsIqFI`
- Superseded no-effect mission: `mission:issue-194` (hosted May authority
  recorded; no implementation edit or execution effect)
- Superseded failed-packet mission: `mission:issue-194-local-fallback` (local
  Gemma May returned an exact four-path response, but `git apply --check`
  rejected it as corrupt at line 20; no patch was applied and no repository
  effect occurred; packet, response, patch, validation result, and unchanged
  HEAD are digest-bound in
  `docs/missions/issue-194-gemma-failure-evidence.json`)
- Superseded failed-packet mission: `mission:issue-194-devstral-fallback`
  (local Devstral May returned all four paths, but included a Markdown fence,
  fabricated index header, and malformed first hunk; `git apply --check`
  rejected it at line 28 and no repository effect occurred; exact evidence is
  bound in `docs/missions/issue-194-devstral-failure-evidence.json`)
- Superseded failed-packet mission: `mission:issue-194-gemma-recovery-v2`
  (focused local Gemma May reasoning identified the intended four-path change,
  but its patch hunk counts were malformed; `git apply --check` rejected it at
  line 48 and no repository effect occurred; exact evidence is bound in
  `docs/missions/issue-194-gemma-v2-failure-evidence.json`)
- Subject: `github:RanSolo/shield-workspace/issue/194`
- Base revision: `75cbe9974bab03c851601cde8e9249a63c384c0c`
- Branch: `agent/issue-194-temp-name`
- Accountable plan owner: Hill
- Intended implementation seat after approval: May
- Status: successor planning only; no production edit, #137 external run, or
  #29 work has started

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

### Hosted implementation executor

The three local fallback missions proved that local models understood material
parts of the design but could not reliably serialize a mechanically valid
four-file raw diff. Every packet was rejected before application, and their
digest-bound evidence proves the implementation files remain unchanged.

The final successor preserves the May seat and uses:

- model: `gpt-5.6-sol`;
- reasoning runtime: `runtime:codex-hosted-may-sol`;
- tool executor: `executor:codex-hosted-workspace-tools`.

After Fury approval, renewed signed Wheels Up, and a signed active May binding,
hosted May receives the exact plan and clean signed HEAD. May uses normal
bounded repository tools to inspect and edit exactly the four approved paths,
runs the approved focused and full validation, and creates one implementation
commit with the signed planning HEAD as its sole parent. It may iterate within
that single authorized workspace execution when tests or mechanical checks
fail, but it must not widen paths, redesign the plan, run external effects, or
enter #137/#29. Hill verifies the final parent, exact four-path diff, clean
worktree, and reported validation before Mack and Fury review the exact commit.

Any stale HEAD, dirty prestate, path widening, unapproved effect, unresolved
validation failure, or external modification fails closed. This changes only
the authorized executor from raw local patch serialization to the repository's
normal hosted May tool surface; it creates no new seat or authority class.

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
confinement, precondition recheck, and uncertain-effect behavior remain.

### Executor-owned cleanup correction

Deterministic naming exposes an existing cleanup defect in
`packages/shield-team-system/scripts/model/may-tool-executor.mjs`: its `finally`
block unconditionally attempts to unlink the derived path, including when
`O_EXCL` failed and this invocation never created the entry.

Correct that boundary without weakening creation:

- initialize no ownership before `open`;
- only after `open(O_CREAT | O_EXCL | O_NOFOLLOW)` succeeds, obtain and retain
  the created handle's regular-file device/inode identity and mark it owned by
  this invocation;
- close any open handle in `finally`;
- attempt cleanup only when ownership was established, the current path is a
  non-symlink regular file, and its device/inode still exactly matches the
  owned handle identity;
- never unlink a pre-existing regular file, symlink, external symlink target,
  or substituted path entry;
- after successful rename, the temporary path is absent and cleanup is a
  no-op.

A stale same-identity collision therefore remains in place and repeated calls
continue failing closed until a separate owner/recovery action removes it.
Existing target-write and uncertain-effect semantics remain unchanged.

### Real-composition regression test

In `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`, add one
focused integration test that:

1. creates a disposable temporary Git repository and a dynamic exact authority
   projection bound to its canonical root and HEAD;
2. freezes an absent write operation and a shell-free Node validation operation
   with the real executable identity and exact effect keys;
3. calls the production `runGovernedMayDispatchStepV1`;
4. supplies the production `runMayControlLoop`, with `fetchImpl` replaced by
   deterministic in-memory response objects for model discovery, one write
   call, one validation call, and the final May message;
5. allows the production `runMayToolCall`/filesystem executor to perform the
   exact write and validation in the disposable repository;
6. asserts literal dispatcher completion, exact target bytes, one ordered write
   and validation, and no remaining `.shield-may-*.tmp` file.

The dispatcher, control loop, and tool executor are production implementations.
The existing deterministic governed-dispatch fixture doubles remain for the
schema-9 journal projection, Fury/dispatch ledgers, Delivery Workspace,
Helicarrier, permission contexts/audit stores, control-event store,
`runMissionCycle` wrapper, and terminal receipt readback. Those layers are not
under test here and their existing contract suites remain authoritative. The
test must fail on the base revision with `may_temporary_name_invalid` and pass
with the correction. It must not call LM Studio, GitHub, or any external
network.

In `packages/shield-team-system/tests/may-tool-executor.test.mjs`, add focused
cleanup tests proving:

- a pre-existing regular-file collision is not changed or removed;
- a pre-existing symlink collision is not removed and its external target is
  unchanged;
- repeating the same session/tool identity continues to fail while either
  collision remains;
- a path substituted after owned creation is not unlinked by cleanup.

## Exact writable paths

- `packages/shield-team-system/src/governed-may-dispatch-v1.mts`
- `packages/shield-team-system/scripts/model/may-tool-executor.mjs`
- `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/may-tool-executor.test.mjs`

No authority, journal, receipt, permission, CLI, fixture, public API, or
external-run path is in implementation scope. This plan and the May blueprint
remain immutable during implementation.

## Validation

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs
node --test packages/shield-team-system/tests/may-tool-executor.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

## Stop and review sequence

1. Commit this plan and the May blueprint without production changes.
2. Fury reviews the exact planning revision.
3. On `FURY_REVISE`, correct only planning artifacts and return the new exact
   revision to the same Fury seat.
4. On `FURY_PASS`, obtain superseding signed Wheels Up for exactly the four
   implementation paths and a signed active May binding for
   `runtime:codex-hosted-may-sol` with
   `executor:codex-hosted-workspace-tools` before May edits the workspace.
5. Hosted GPT-5.6 Sol May edits only the approved paths, validates, and creates
   one implementation commit with the signed HEAD as sole parent. Hill verifies
   the final clean four-path revision. That commit is the implementation
   revision.
6. Mack validates that exact revision; Fury performs exact-revision conformance
   review.
7. Open one bounded draft PR for human review. Do not merge, run #137's external
   fixture, or enter #29.
