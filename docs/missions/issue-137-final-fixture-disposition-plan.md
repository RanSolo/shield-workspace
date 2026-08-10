# Issue #137 — final fixture disposition plan

## Exact planning identity

- Mission: `mission:issue-137-final-fixture-disposition`
- Subject: `github:RanSolo/shield-workspace/issue/137`
- Base: `main` at `404867747b854b3e8c8dd8909e1f8db31dece3fa`
- Branch: `agent/issue-137-final-fixture-disposition`
- Accountable plan owner: Hill
- Implementation seat after approval: May
- Validation seat: Mack
- Architecture and conformance seat: one continuous Fury reviewer

## Verified current state

The fixture's trusted isolation, package-composition, external-revision, failure-injection, rollback, and operator-checkout protections already exist. The fresh-main fixture suite passes 37/37 tests and builds `@shield/team-system` through its pretest. Fury additionally confirmed that the composer currently measures a supplied tarball but does not compare that digest with the package digest pinned by the external release baseline. A substituted package with the expected name and version can therefore reach `composed`; this final disposition must close that package-content seam.

The remaining defect is a stale disposition seam:

- `fixture-manifest.mjs` still reports #24, #138, and #140 as blockers although all three issues are closed;
- `composeMinimumFixture(...)` unconditionally returns `dependency_contract_unavailable`, so it cannot reach the existing trusted composition and grading entry points;
- the runbook and release-baseline identity still describe and bind that obsolete state.

This mission changes the fixture disposition only. It does not redesign the trusted launcher, isolation adapter, grader, evidence authority, or release contract.

## Frozen implementation

### 1. Reconcile the manifest

In `benchmarks/v0.3-external-acceptance-v1/fixture-manifest.mjs`:

- replace the obsolete #24/#138/#140 blocker entries with an empty `dependencyBlockers` array;
- retain the versioned manifest shape, stop conditions, fixture identity, one-path mission scope, human-evidence boundaries, and #14 exclusion unchanged.

An empty blocker list records that the prerequisites are dispositioned; it grants no execution, publication, merge, deployment, or release authority.

### 2. Open only the measured ready path

In `benchmarks/v0.3-external-acceptance-v1/src/driver.mjs`:

- preserve closed input validation, trusted release-baseline verification, blind-status checks, and host-configuration checks;
- retain `dependency_contract_unavailable` whenever the manifest contains one or more blockers;
- when the blocker list is empty, call the existing `inspectExternalRevision(...)` against the exact external root/base/head supplied by the operator;
- propagate any invalid or blocked revision result unchanged;
- return a closed `ready` preflight only after the external repository is canonical, clean, based on the frozen template bytes, at the exact current head, and changed only at `src/greeting.mjs`;
- include the measured external revision, existing fixture/host/blind preflight, and evidence inventory in that result.

The driver must not install or import the package, execute candidate code, mutate either repository, or contact GitHub. Package artifact identity remains the trusted launcher's responsibility.

### 3. Enforce the pinned package bytes at the trusted launcher

In `benchmarks/v0.3-fixture-host-launcher.mjs`, within `composeExternalArtifact(...)`:

- read the regular external package artifact as it does now;
- before creating an isolation root, installing, or importing package code, compare the measured artifact SHA-256 with `baseline.package.digest`;
- return closed `state: "blocked", reason: "package_artifact_digest_mismatch"` on inequality;
- preserve the existing exact installed package name/version check, isolated offline install, public-surface import, denial proof, interruption handling, and cleanup behavior.

The baseline and identity record—not caller input—remain the source of the expected digest.

### 4. Rebind content identity and tests

In `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`:

- update only the framed SHA-256 digests for covered artifacts whose bytes change;
- update the package digest to an exact deterministic tarball packed from an isolated checkout of the authorized planning revision;
- preserve the closed identity schema and package name/version.

The package subtree is excluded from this mission's writable paths. May must create the pin by checking out the authorized planning revision in a fresh detached temporary worktree, building `@shield/team-system` from that checkout with the repository's locked dependencies, and running `npm pack` against that checkout with the existing `--ignore-scripts` behavior. After the implementation commit, Hill must repeat the same isolated build/pack procedure at the exact implementation revision. The two tarball SHA-256 values must be byte-identical because the package subtree is unchanged; inequality fails closed before Mack/Fury review. The exact implementation-revision artifact is retained for the disposable run.

In `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`:

- replace stale blocker expectations with direct behavior tests for the empty-blocker ready transition;
- prove malformed inputs and identity drift still fail before repository/package effects;
- prove missing, dirty, wrong-head, wrong-base, frozen-base drift, and scope drift cannot produce `ready`;
- prove a clean exact one-path external revision produces literal `ready` with measured revision evidence and the existing human-evidence inventory;
- prove a substituted same-name/version tarball cannot reach isolation or installation and returns `package_artifact_digest_mismatch`;
- prove the exact pinned tarball still reaches `composed`;
- retain focused trusted-composition, capability-denial, interruption, failure-injection, rollback, and operator-readback tests;
- refresh only the independently pinned identity-record and launcher digests changed by this mission.

### 5. Correct the operator runbook

In `benchmarks/v0.3-external-acceptance-v1/RUNBOOK.md`:

- record #24, #138, and #140 as closed prerequisites rather than live blockers;
- document the `ready` preflight and the required separation between preflight, trusted package composition, and trusted disposable grading;
- provide the exact one-run sequence for a fresh unscored repository and list the evidence to retain;
- state that the run is local/disposable, makes no GitHub or Asmark effect, and cannot authorize #29, merge, deployment, or release.

## Exact writable implementation paths

- `benchmarks/v0.3-external-acceptance-v1/fixture-manifest.mjs`
- `benchmarks/v0.3-external-acceptance-v1/src/driver.mjs`
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/RUNBOOK.md`
- `benchmarks/v0.3-fixture-host-launcher.mjs`

The mission brief and this plan are planning artifacts and remain immutable during implementation. Package production code, authority contracts, GitHub adapters, Asmark repositories, and #29 are excluded.

## Validation and exact-revision gates

1. Commit only the mission brief and this plan.
2. Fury reviews that exact planning revision. Any revision returns to the same Fury reviewer.
3. After `FURY_PASS`, initialize and authorize the schema-9 mission, issue exact-path/effect Wheels Up, and bind May at the reviewed planning HEAD.
4. May implements only the six writable fixture paths. Before committing, May creates the deterministic package pin from an isolated checkout of the authorized planning revision as specified above, records it in the identity file, refreshes the covered-artifact and release-baseline digests, and commits one implementation revision whose sole parent is the authorized planning HEAD.
5. Run:

   ```text
   npm --prefix benchmarks/v0.3-external-acceptance-v1 test
   npm test --workspace packages/shield-team-system
   git diff --check
   ```

6. Repack from an isolated checkout of the exact implementation commit and require its SHA-256 to equal the precommitted package pin. Mack then independently validates that exact clean revision, including package-byte equality, identity readback, substituted-artifact rejection, and the no-effect ready preflight. Fury performs exact-revision conformance review.
7. Only after both return `PASS`, use that exact digest-matched implementation-revision package artifact and run once from a newly created repository outside the SHIELD workspace:
   - establish the documented post-install/post-init adoption base;
   - create one candidate commit changing only `src/greeting.mjs`;
   - obtain `ready` from `launchExternalFixture(...)`;
   - obtain `composed` from `composeExternalArtifact(...)`;
   - obtain `passed` from `gradeExternalFixture(...)`, including deterministic injected failure, exact rollback, and unchanged operator checkout readback.
8. Record exact revisions, artifact digest, runtime/tool identities, timing/usage when observable, friction, human interventions, and all returned receipts on #137. Stop. Do not enter #29 or perform Asmark, merge, deployment, or release effects.

Any stale revision, identity mismatch, unavailable protected isolation, unexpected effect, failed validation, or non-passing Mack/Fury verdict stops the mission before the disposable run.
