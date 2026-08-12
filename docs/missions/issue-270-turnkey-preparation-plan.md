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

`mission-builder-v1.mts` is the sole production invocation point for the
authority-none transition compiler. `mission-cli.mts` owns host resolution,
live observations, the PIN interaction, and delegation to the existing
`prepareAuthorizeWheelsUp` / signing / append implementation. Do not put this
pre-PIN preparation logic into `governed-may-dispatch-v1.mts`; no model is
invoked in this transition.

## Durable evidence and preparation rules

The host resolves the current mission and its protected transition-plan/Fury
review evidence by mission ID and configured repository paths. Hill supplies
neither action JSON nor an intent path. Raw Fury receipt entries are replayed
through the existing `evaluateSeatDispatchAttributionV1` path used by
`deriveFuryPlanReviewEvidenceV1`; the resulting Team System projection—not raw
receipt prose and not a caller assertion—feeds the authority-none compiler.

The materialized reviewed intent and preparation receipt are closed,
content-addressed artifacts. Their identities bind:

- mission, subject, repository, transition-plan ID/digest, and parent-plan
  identity;
- raw Fury receipt-set SHA-256 and the exact attributed reviewer
  runtime/model/executor;
- selected action/effect/capability/path/validation/publication scopes;
- live canonical root, branch, base, HEAD, changed paths, path kinds, journal
  sequence/digest, signer binding, and remaining gates.

Resolution rereads the protected evidence and recomputes all identities before
the PIN. Missing, non-regular, symlinked, replaced, forged, stale, ambiguous,
duplicate, conflicting, cross-plan, cross-mission, cross-repository, or
runtime/model/executor-mismatched evidence returns one stable pre-PIN failure
and performs no signer, journal, Git, GitHub, or model effect.

The existing post-display/post-PIN freshness check remains separate and
unchanged; preparation must not collapse pre-PIN derivation and post-PIN
freshness into one snapshot.

## Rapid-strike lanes and acceptance mapping

### Lane A — resolve and compile (AC 1, 4, 5)

- Link `@shield/mission-preparation` into `@shield/team-system` with the npm
  workspace command above.
- Add the private Mission Builder composition seam that accepts only normalized
  Team System projections and calls `prepareMissionTransitionV1`.
- Add the `mission prepare-next --mission-id --root` command surface with
  `--human`, `--json`, and `--passcode-stdin` output/input modes matching the
  existing command conventions; it accepts no `--input` or intent path.
- Resolve and revalidate the protected reviewed intent by mission ID and root.

Tests prove no caller-authored action payload/path is accepted, exact intent
and raw-receipt-set bindings survive materialization/readback, and replaced,
stale, or cross-plan artifacts fail before a PIN prompt.

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

Tests prove exactly one decision/PIN, one atomic append, and the unchanged
ordered event set:

1. `governance.decided`
2. `implementation.authorized`
3. `runtime.binding_recorded`
4. `review.publication_authorized`

Cancellation or failed preflight appends zero entries. A successful retry
against already-current semantic authority returns a stable existing/current
result rather than duplicating authority.

## Writable paths

Implementation is limited to:

- `package-lock.json`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/src/mission-builder-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-human-output-v1.mts` only if the
  existing renderer cannot represent a required additive preparation field;
- `packages/shield-team-system/tests/mission-builder-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/mission-human-output.test.mjs` only if the
  renderer path above changes.

No `@shield/mission-preparation` source changes, governed May dispatch changes,
public package export changes, new authority class, or new generic command
interpreter are authorized by this plan.

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
Mission Preparation dependency through a clean offline install, and verifies
the exact legacy/new CLI compatibility matrix at the reviewed HEAD.

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
