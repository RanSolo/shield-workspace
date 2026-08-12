# Issue #270 — Turnkey Hill preparation host plan

## Identity

- Issue: `#270`
- Parent: `#268`
- Accepted predecessor: issue `#269`, merged by PR `#283`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-270-turnkey-preparation`
- Planning base and HEAD: `d3f29002fe6c249152763815a633132589b5a9b1`
- Parent plan commit: `43f6d37687a76c634951880b41f58caab8709753`
- Parent plan SHA-256: `e095e7127c6df042e58992e41b6363ddd99cf48cf0d09c1113c901dc46a422c0`
- Authority: planning only; this document grants no implementation, signing,
  publication, merge, deployment, release, or final-acceptance authority.

## Objective

Add one canonical Team System command that accepts only mission identity and
repository root, derives the exact fresh `authorize-wheels-up` transition from
durable mission/review evidence plus live repository observation, presents the
existing human decision, accepts one PIN, and reuses the unchanged atomic
four-entry append path.

The successful operator path is:

```text
shield mission prepare-next --mission-id mission:issue-N --root . --human
→ derive and revalidate reviewed transition intent
→ display the exact existing Wheels Up decision
→ one PIN
→ one four-entry atomic append
→ empty shell prompt
```

The legacy direct `mission authorize-wheels-up --input ...` command remains
supported and behavior-compatible.

## Architecture boundary

`@shield/mission-preparation` remains authority-none and cannot read raw Fury
receipts, claim reviewer attribution, sign, mutate journals, prompt, or perform
repository effects. `@shield/team-system` owns host observation and is the sole
raw-attribution verifier. Dependency direction is exactly:

```text
@shield/team-system → @shield/mission-preparation
```

The dependency must be established as the exact accepted A0 version with npm
workspace linking:

```bash
npm install @shield/mission-preparation@0.1.0 --save-exact --workspace @shield/team-system
```

The lockfile must retain the local workspace link while the packed Team System
manifest must declare exactly `"@shield/mission-preparation": "0.1.0"`.

No `tsconfig` path alias, copied compiler, duplicate attribution evaluator, or
reverse dependency is permitted.

Mission Builder intentionally adds one public typed producer,
`buildMissionTransitionPlanV1(input: unknown)`. The exact closed input type is
`BuildMissionTransitionPlanInputV1 = Omit<TransitionPlanV1, "schemaId" |
"authority" | "id" | "digest">`; runtime validation requires exactly those
body keys and ordinary enumerable data. The exact result type is
`BuildMissionTransitionPlanResultV1 = {state:"built", plan:TransitionPlanV1} |
{state:"invalid", code:"malformed_transition_plan_input" |
"invalid_transition_plan", errors:readonly string[]}`. Those two types and the
function are the only additive Mission Builder exports. The implementation
derives identity with the A0 contract helpers and returns authority-none data.
Package-surface and clean TypeScript declaration-consumer tests freeze all
three exports; this is not a signing, dispatch, or effect API.

The internal `MissionTransitionPlanReviewV1` is a closed ordinary-data
contract with exactly: `schemaVersion:1`,
`contractVersion:"mission.transition-plan-review.v1"`, `authority:"none"`,
`reviewId`, `reviewDigest`, `missionId`, `subjectId`, `repositoryId`,
`planningBaseRevision`, `parentPlanCommit`, `parentPlanPath`,
`parentPlanRawSha256`, `transitionPlanId`, `transitionPlanDigest`,
`verdict:"PASS"`, `reviewerSeatId:"fury"`, `reviewerRuntimeId`,
`reviewerModelId`, `reviewerExecutorId`, `reviewedArtifactId`, and
`reviewedArtifactRevision`. `validateMissionTransitionPlanReviewV1` rejects
extra keys and recomputes deterministic `reviewId` and `reviewDigest` from the
remaining fields. The dispatch identity must bind `artifactId` and
`artifactRevision` to the transition plan ID/digest, and its one terminal
receipt must contain both review ID and review digest in `outputEvidenceRefs`.
This is how raw host-observed Fury attribution binds the review artifact.

`mission-preparation-host-v1.mts` is the sole Team System integration seam. It
is otherwise internal (not separately re-exported and not added to the package
`exports` map) and owns two closed operations:

1. `materializeReviewedMissionTransitionV1`, invoked by the host after Fury's
   exact-plan dispatch has durably completed, accepts typed Mission Builder
   output plus the exact Fury plan-review artifact and dispatch identity,
   rereads the raw dispatch ledger, derives attribution, validates the
   transition plan, derives the parent review and intent, and create-once
   stores that reviewed graph; it does not create a live observation,
   candidate, or preparation receipt;
2. `resolvePreparedMissionTransitionV1`, invoked only from `prepare-next`,
   resolves that graph by mission ID, rereads the dispatch ledger, rederives
   attribution, observes the live repository and journal, calls the compiler,
   and returns either a closed candidate or a stable blocked reason.

`mission-cli.mts` exposes a host-facing, non-interactive
`mission record-reviewed-transition --transition-plan <file>
--review-artifact <file> --dispatch-receipt-id <id> --mission-id <id> --root .`
command. This is the production call site used by orchestration immediately
after the named Fury receipt becomes terminal; it invokes the materializer and
returns the content-addressed store identity. It never prompts, signs, appends
mission authority, or accepts an attribution verdict. It is not part of the
operator key turn and does not weaken the rule that Hill's `prepare-next`
command supplies only mission ID and root.

The internal host is the sole production consumer of the authority-none
compiler. `mission-cli.mts` also owns option parsing, rendering, the PIN
interaction, and delegation to the
package-internal `executeAuthorizeWheelsUpV1` shared executor. Its closed
`AuthorizeWheelsUpExecutionDependenciesV1` contains exactly `renderDecision`,
`readPasscode`, `signBatch`, and `appendBatchAtomic`; production defaults are
the existing renderer, passcode reader, batch signer, and atomic append. Both
the legacy direct route and `prepare-next` call this one executor. Do not
put this pre-PIN preparation logic into `governed-may-dispatch-v1.mts`; no model
is invoked in this transition.

## Durable evidence and preparation rules

The host resolves the current mission and its protected transition-plan/Fury
review evidence by mission ID and configured repository paths. Hill supplies
neither action JSON nor an intent path. The existing seat-dispatch store gains
a distinct package-internal `readSeatDispatchReceiptLedgerSnapshotV1`; the
existing public ledger reader and result shape remain unchanged. The internal
snapshot returns exact readback `bytes` and an ordered array of copied UTF-8
bytes for each canonical JSON line, excluding its newline delimiter. The host hashes the
selected raw receipt set with `computeRawReceiptSetSha256V1`, selects the one
exact terminal Fury receipt named by the typed review input, and replays its
complete parsed ledger through `evaluateSeatDispatchAttributionV1` so global
sequence and interleaved lifecycle validation remain intact. It derives
`mission.parent-plan-review-evidence.v1` from that attributed review artifact
and rejects zero, duplicate, or conflicting candidates. Existing
implementation-blueprint Fury evidence is not reused or represented as
parent-plan evidence. The resulting Team System projection—not raw receipt
prose and not a caller assertion—feeds the authority-none compiler.

No human-facing command or decision materializes the intent. The orchestration
host calls the record command above, which invokes
`materializeReviewedMissionTransitionV1` as the deterministic successor to a
durable Fury PASS. Its closed input contains the transition plan, exact Fury
plan-review artifact, expected binding, and exact dispatch identity; it does
not accept an attribution verdict, reviewed projection, signer input, action
JSON, or intent path. The review artifact is the exact artifact attributed by
the receipt and contains the closed PASS verdict and reviewer declarations;
Team System compares those declarations with host-observed runtime/model/
executor history before deriving the parent-review contract. The operation
derives the review and intent itself, writes one
create-only artifact beneath
`.shield/audit/mission-preparation/<sha256(mission-id)>/reviewed-transition.json`,
syncs parent directories, rereads exact bytes, and records no authority.

Materialization creates each directory at mode `0700` after no-follow,
realpath-confinement checks. It writes canonical bytes to a same-directory
mode-`0600` temporary regular file opened with `O_EXCL|O_NOFOLLOW`, fsyncs and
closes it, atomically installs it without overwrite by hard-linking the
verified temporary inode to the absent final name, fsyncs the directory,
unlinks the temporary name, fsyncs the directory again, then opens the final
name with `O_NOFOLLOW` and verifies inode, mode, bytes, graph ID, and digest.
An exact existing graph returns `{state:"already_materialized", graphId,
graphDigest}`. Different valid content returns `materialization_conflict`.
Malformed existing content, partial files, uncertain link/sync/unlink, inode or
directory replacement, or failed readback returns `recovery_required`. No path
overwrites or repairs an existing final artifact.

The materialized reviewed plan, parent review, and intent are one closed,
content-addressed `MissionReviewedTransitionGraphV1` with exactly
`schemaVersion:1`, `schemaId:"mission.reviewed-transition-graph.v1"`,
`authority:"none"`, `graphId`, `graphDigest`, `transitionPlan`,
`parentPlanReviewEvidence`, and `transitionIntent`. The ID/digest are
deterministically recomputed over the other fields. Its identities bind:

- mission, subject, repository, transition-plan ID/digest, and parent-plan
  identity;
- raw Fury receipt-set SHA-256 and the exact attributed reviewer
  runtime/model/executor;
- selected action/effect/capability/path/validation/publication scopes.

Live canonical root, branch, base, HEAD, changed paths, path kinds, journal
sequence/digest, signer binding, and remaining gates are never stored in this
graph. They are bound only by the resolution-time observation, candidate, and
in-memory/output-only preparation receipt.

Resolution rereads the protected artifact and exact dispatch-log bytes and
recomputes all identities immediately before candidate-to-
legacy-intent conversion. Missing, non-regular, symlinked, replaced, forged, stale, ambiguous,
duplicate, conflicting, cross-plan, cross-mission, cross-repository, or
runtime/model/executor-mismatched evidence returns one stable pre-PIN failure
and performs no signer, journal, Git, GitHub, or model effect.

Before display, the CLI derives a closed legacy projection from
`PreparedAuthorizeWheelsUp`. Its action fields are canonically equal to
`candidate.actionInput`; its decision fields are canonically equal to
`candidate.decisionProjection`; and its repository, journal, signer, and
remaining-gate fields are canonically equal to the compiler observation. This
closes the candidate/legacy-adapter gap without comparing unlike object shapes. The
existing post-display/post-PIN freshness check remains separate and unchanged;
preparation must not collapse pre-PIN derivation and post-PIN freshness into
one snapshot.

Retry behavior is host-owned rather than added to the fresh-only preparation
compiler. Before invoking that compiler, authoritative schema-9 replay chooses
exactly one of two states:

- fresh pending: continue through preparation and the one-PIN transition;
- already authorized: require exactly one contiguous ordered four-entry key
  turn (`governance.decided`, `implementation.authorized`,
  `runtime.binding_recorded`, `review.publication_authorized`), exact previous
  sequence links and constituent payload identities/digests, exactly one
  approved Coulson authorization, a non-revoked implementation authority, one
  matching active runtime binding, one matching publication authority, and
  semantic equality with the stored reviewed graph and live observation. Then
  return `already_authorized` without prompting or appending; any partial,
  replaced, duplicate, revoked, or mismatched provenance fails as
  `authority_conflict`.

Every other replay state is blocked. The `already_authorized` machine result is
the exact closed object `{schemaVersion:1, state:"already_authorized",
missionId, missionRevisionId, headRevision, endingJournalSequence,
authorizationManifestDigest}`; human mode renders the same six values in fixed
order and never prints `Passcode:`. Conflict precedence is malformed/replay
failure, protected-evidence mismatch, repository/config/signer mismatch,
partial key turn, then semantic authority conflict. The compiler therefore
remains a fresh transition compiler and no duplicate authority is created.

## Rapid-strike lanes and acceptance mapping

### Lane A — protected store and resolve (AC 1, 4, 5)

- Link `@shield/mission-preparation` into `@shield/team-system` with the npm
  workspace command above.
- Add the intentional public Mission Builder transition-plan producer and the
  internal host/store seam described above; add no new package subpath.
- Add the separate internal seat-dispatch snapshot reader with exact readback
  bytes and per-entry raw bytes, then bind the selected receipt-set SHA-256
  into the stored graph without changing the public ledger reader.
- Add the host-facing record command as the sole production materialization
  call site; tests invoke the real CLI after a terminal Fury receipt.
- Add the `mission prepare-next --mission-id --root` command surface with
  `--human`, `--json`, and `--passcode-stdin` output/input modes matching the
  existing command conventions; it accepts no `--input` or intent path.
- Resolve and revalidate the protected reviewed intent by mission ID and root.

Tests prove no caller-authored action payload/path or attribution verdict is
accepted by `prepare-next`, exact intent and raw-receipt-set bindings survive
create-sync-readback materialization, materialization never requires a live
observation or calls the compiler, and replaced, stale, or cross-plan artifacts
fail before a PIN prompt.

### Lane B — attribution and fail closure (AC 2, 3, 6)

- Route raw Fury receipt verification only through the existing Team System
  attribution path; Mission Preparation receives only the reviewed projection.
- Reject forged projection objects and every raw receipt/reviewer identity
  substitution before candidate eligibility.
- Prove the Nx graph contains Team System → Mission Preparation and no reverse
  path or duplicate evaluator.

Tests cover missing/duplicate/conflicting receipts, interleaved valid receipt
lifecycles, wrong mission/plan/artifact, stale repository revision, wrong Fury
seat, and runtime/model/executor substitution. Each case asserts no passcode
prompt and unchanged protected state.

### Lane C — unchanged key turn (AC 7, 8)

- Convert the prepared candidate into the existing closed
  `AuthorizeWheelsUpIntent` and call the existing `prepareAuthorizeWheelsUp`.
- Reuse `renderAuthorizeWheelsUpHumanV1`, `signPayloadBatchWithSigner`,
  `assertPreparedAuthorizeWheelsUpFresh`, and
  `appendProfileAwareMissionEntriesAtomicV1` without changing authority
  semantics.
- Route both legacy and turnkey commands through
  `executeAuthorizeWheelsUpV1` with the production dependency defaults; tests
  inject its exact four-function dependency interface for call counts.
- Preserve the legacy direct command and JSON output vectors.
- Compare the compiler candidate and observation to their explicit closed
  projections from the prepared legacy result before rendering; any mismatch
  returns before output or passcode input.

Tests prove exactly one decision/PIN, one atomic append, and the unchanged
ordered event set:

1. `governance.decided`
2. `implementation.authorized`
3. `runtime.binding_recorded`
4. `review.publication_authorized`

Cancellation or failed preflight appends zero entries. An exact retry against
already-current semantic authority returns `already_authorized`, emits no PIN,
and invokes the atomic append zero times. Tests instrument decision rendering,
passcode acquisition, signing, and the atomic append. Success records exactly
one call to each. A blocked path records zero calls after its stopping point;
cancellation records one render and one passcode read but zero signing and
append calls. Every failure test snapshots and proves unchanged configuration,
mission journal, preparation store, dispatch log, signer bytes, Git HEAD, and
Git status, and proves the exact renderer invocation count.

## Writable paths

Implementation is limited to:

- `package-lock.json`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/src/mission-builder-v1.mts`
- `packages/shield-team-system/src/authorize-wheels-up-executor-v1.mts`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/mission-preparation-store-v1.mts`
- `packages/shield-team-system/src/seat-dispatch-store.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-human-output-v1.mts` only if the
  existing renderer cannot represent a required additive preparation field;
- `packages/shield-team-system/tests/mission-builder-v1.test.mjs`
- `packages/shield-team-system/tests/authorize-wheels-up-executor-v1.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-store-v1.test.mjs`
- `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/mission-human-output.test.mjs` only if the
  renderer path above changes.
- `packages/shield-team-system/tests/package-surface.test.mjs`

No `@shield/mission-preparation` source changes, governed May dispatch changes,
new package subpath, new authority class, or new generic command interpreter
are authorized by this plan. The only additive public symbol is the typed,
authority-none Mission Builder producer named above. The new host/store modules
remain package-internal and their direct imports are limited to Team System
source and tests.

## Validation

Use Nx task boundaries and uncached exact-revision evidence:

```bash
npm exec nx run @shield/mission-preparation:build --skip-nx-cache
npm exec nx run @shield/mission-preparation:test --skip-nx-cache
npm exec nx run @shield/team-system:build --skip-nx-cache
npm exec nx run @shield/team-system:test --skip-nx-cache
npm exec nx affected -t build,test --base=d3f29002fe6c249152763815a633132589b5a9b1 --head=HEAD --skip-nx-cache
npm exec nx graph --focus=@shield/team-system --print
git diff --check
```

Mack additionally proves the packed Team System artifact can resolve the packed
Mission Preparation dependency through a clean offline install. The validation
packs both workspace packages, installs the Mission Preparation tarball first
and the Team System tarball second into an empty temporary consumer with
network disabled, then imports the supported Team System surface and executes
the CLI help vector. Mack also verifies the exact legacy/new CLI compatibility
matrix, one-prompt/one-append counters, and unchanged-byte failure matrix at
the reviewed HEAD.

## Explicit exclusions

- No #238 Guided QA implementation.
- No #272 validation-authority expansion.
- No local-model packet compiler or Mack campaign.
- No publication-only or runtime-binding-only adapter beyond the initial
  `authorize-wheels-up` transition.
- No May/model invocation, automatic merge, deployment, release, destructive
  cleanup, Ready-for-Review transition, Fitz decision, or final acceptance.

## Gates

Fury must review this exact plan revision. Implementation starts only after
Coulson authorizes the Fury-PASSed exact plan and writable/effect scope. After
the three compact lanes, Mack validates and Fury reviews the exact final
revision; publication stops at a draft PR for human review.
