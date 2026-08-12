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

The dependency must be established with npm workspace linking:

```bash
npm install @shield/mission-preparation --workspace @shield/team-system
```

No `tsconfig` path alias, copied compiler, duplicate attribution evaluator, or
reverse dependency is permitted.

`mission-preparation-host-v1.mts` is the sole Team System integration seam. It
is an internal module (not re-exported by `public/index.*` and not added to the
package `exports` map) that owns two closed operations:

1. `materializeReviewedMissionTransitionV1`, invoked by the host after Fury's
   exact-plan dispatch has durably completed, accepts typed Mission Builder
   output plus the exact Fury plan-review artifact and dispatch identity,
   rereads the raw dispatch ledger, derives attribution, calls
   `prepareMissionTransitionV1`, and create-once stores the reviewed graph;
2. `resolvePreparedMissionTransitionV1`, invoked only from `prepare-next`,
   resolves that graph by mission ID, rereads the dispatch ledger, rederives
   attribution, observes the live repository and journal, calls the compiler,
   and returns either a closed candidate or a stable blocked reason.

The compiler call is not added to `mission-builder-v1.mts`, whose exports are
public through the existing wildcard facade. Mission Builder remains the
typed producer of the transition plan; the internal host is the sole
production consumer of the authority-none compiler. `mission-cli.mts` owns
only option parsing, rendering, the PIN interaction, and delegation to the
existing `prepareAuthorizeWheelsUp` / signing / append implementation. Do not
put this pre-PIN preparation logic into `governed-may-dispatch-v1.mts`; no model
is invoked in this transition.

## Durable evidence and preparation rules

The host resolves the current mission and its protected transition-plan/Fury
review evidence by mission ID and configured repository paths. Hill supplies
neither action JSON nor an intent path. The existing seat-dispatch store ledger
reader is extended additively to return the exact readback `bytes` already held
by its private log result and an ordered array of copied UTF-8 bytes for each
canonical JSON line, excluding its newline delimiter. The host hashes the
selected raw receipt set with `computeRawReceiptSetSha256V1`, selects the one
exact terminal Fury receipt named by the typed review input, and replays its
entries through `evaluateSeatDispatchAttributionV1`. It derives
`mission.parent-plan-review-evidence.v1` from that attributed review artifact
and rejects zero, duplicate, or conflicting candidates. Existing
implementation-blueprint Fury evidence is not reused or represented as
parent-plan evidence. The resulting Team System projection—not raw receipt
prose and not a caller assertion—feeds the authority-none compiler.

No new operator command materializes the intent. The orchestration host calls
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

The materialized reviewed intent and preparation receipt are closed,
content-addressed artifacts. Their identities bind:

- mission, subject, repository, transition-plan ID/digest, and parent-plan
  identity;
- raw Fury receipt-set SHA-256 and the exact attributed reviewer
  runtime/model/executor;
- selected action/effect/capability/path/validation/publication scopes;
- live canonical root, branch, base, HEAD, changed paths, path kinds, journal
  sequence/digest, signer binding, and remaining gates.

Resolution rereads the protected artifact and exact dispatch-log bytes and
recomputes all identities immediately before candidate-to-
legacy-intent conversion. Missing, non-regular, symlinked, replaced, forged, stale, ambiguous,
duplicate, conflicting, cross-plan, cross-mission, cross-repository, or
runtime/model/executor-mismatched evidence returns one stable pre-PIN failure
and performs no signer, journal, Git, GitHub, or model effect.

Before display, the CLI requires byte-for-byte equality between the compiler
candidate action input and the manifest produced by
`prepareAuthorizeWheelsUp`; this closes the candidate/legacy-adapter gap. The
existing post-display/post-PIN freshness check remains separate and unchanged;
preparation must not collapse pre-PIN derivation and post-PIN freshness into
one snapshot.

Retry behavior is host-owned rather than added to the fresh-only preparation
compiler. Before invoking that compiler, authoritative schema-9 replay chooses
exactly one of two states:

- fresh pending: continue through preparation and the one-PIN transition;
- already authorized: if the active implementation authority, runtime binding,
  publication authority, repository observation, and all four semantic scopes
  exactly equal the stored reviewed graph, return `already_authorized` without
  prompting or appending; otherwise fail closed as `authority_conflict`.

Every other replay state is blocked. The compiler therefore remains a fresh
transition compiler and no duplicate authority is created.

## Rapid-strike lanes and acceptance mapping

### Lane A — protected store and resolve (AC 1, 4, 5)

- Link `@shield/mission-preparation` into `@shield/team-system` with the npm
  workspace command above.
- Add the internal host/store seam described above; do not expose it through
  the public facade or package export map.
- Extend the internal seat-dispatch ledger result with exact readback bytes and
  per-entry raw bytes, then bind the selected receipt-set SHA-256 into the
  stored graph.
- Add the `mission prepare-next --mission-id --root` command surface with
  `--human`, `--json`, and `--passcode-stdin` output/input modes matching the
  existing command conventions; it accepts no `--input` or intent path.
- Resolve and revalidate the protected reviewed intent by mission ID and root.

Tests prove no caller-authored action payload/path or attribution verdict is
accepted, exact intent and raw-receipt-set bindings survive create-sync-
readback materialization, and replaced, stale, or cross-plan artifacts fail
before a PIN prompt.

### Lane B — attribution and fail closure (AC 2, 3, 6)

- Route raw Fury receipt verification only through the existing Team System
  attribution path; Mission Preparation receives only the reviewed projection.
- Reject forged projection objects and every raw receipt/reviewer identity
  substitution before candidate eligibility.
- Prove the Nx graph contains Team System → Mission Preparation and no reverse
  path or duplicate evaluator.

Tests cover missing/duplicate/conflicting receipts, wrong mission/plan/artifact,
stale repository revision, wrong Fury seat, and runtime/model/executor
substitution. Each case asserts no passcode prompt and unchanged journal bytes.

### Lane C — unchanged key turn (AC 7, 8)

- Convert the prepared candidate into the existing closed
  `AuthorizeWheelsUpIntent` and call the existing `prepareAuthorizeWheelsUp`.
- Reuse `renderAuthorizeWheelsUpHumanV1`, `signPayloadBatchWithSigner`,
  `assertPreparedAuthorizeWheelsUpFresh`, and
  `appendProfileAwareMissionEntriesAtomicV1` without changing authority
  semantics.
- Preserve the legacy direct command and JSON output vectors.
- Compare the compiler candidate to the prepared legacy manifest before
  rendering; any mismatch returns before output or passcode input.

Tests prove exactly one decision/PIN, one atomic append, and the unchanged
ordered event set:

1. `governance.decided`
2. `implementation.authorized`
3. `runtime.binding_recorded`
4. `review.publication_authorized`

Cancellation or failed preflight appends zero entries. An exact retry against
already-current semantic authority returns `already_authorized`, emits no PIN,
and invokes the atomic append zero times. Tests instrument the shared CLI
execution seam to prove exactly one passcode request and exactly one atomic
append invocation on success, and byte-for-byte unchanged journal/store files
for every blocked, cancelled, and retry path.

## Writable paths

Implementation is limited to:

- `package-lock.json`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/mission-preparation-store-v1.mts`
- `packages/shield-team-system/src/seat-dispatch-store.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-human-output-v1.mts` only if the
  existing renderer cannot represent a required additive preparation field;
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-store-v1.test.mjs`
- `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/mission-human-output.test.mjs` only if the
  renderer path above changes.
- `packages/shield-team-system/tests/package-surface.test.mjs`

No `@shield/mission-preparation` source changes, governed May dispatch changes,
public package export changes, new authority class, or new generic command
interpreter are authorized by this plan. The new host/store modules are package
internal and their direct imports are limited to Team System source and tests.

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
