# Feature Flight runbook

This runbook joins the promoted `shield-ops` helpers into one supported,
non-authoritative operating sequence. The helpers compile observations and
evidence. They never sign, authorize, dispatch, append a mission journal,
publish, merge, deploy, release, or replace a human gate.

## Roles and authority boundary

- **Operator** is the human who approves mission and publication gates and
  decides whether to retain or remove worktrees.
- **Controlling Hill** is the controller for the whole Feature Flight. Hill
  owns the dependency graph, lane routing, artifact references, and concise
  operator communication. This replaces the ambiguous term “Feature Hill.”
- **Lane Hill** coordinates one child mission and replays that mission's
  authoritative journal before acting on a relay or observation.
- **Helicarrier** is the future host-effect layer that will construct declared
  worktrees, branches, journals, bindings, and isolated dependency
  environments. The promoted tools in this runbook do not yet perform those
  effects.

Mission journals and signed human evidence remain authoritative. Flight plans,
state snapshots, routing reports, command receipts, acceptance reports,
handoffs, integration reports, and teardown plans are durable observations.
An observation can support an authority decision but cannot create one.

## End-to-end sequence

```text
acceptance contract + RED evidence
  -> flight preflight + construction observation
  -> state initialization + routing
  -> independently authorized child missions
  -> GREEN evidence + exact-head handoffs
  -> convergence and integration readiness
  -> teardown planning
  -> tool harvest
```

Examples use absolute paths because evidence must remain unambiguous across
worktrees. Output paths are create-only: choose a new path for every rerun.

### 1. Freeze acceptance and capture RED

Create one contract entry for every source criterion. Each entry must identify
an automated test or a named manual observation.

```bash
npx shield-ops evidence run \
  --mission-id mission:example:lane-a \
  --cwd /absolute/worktree/lane-a \
  --output /absolute/evidence/lane-a/red-command.json \
  -- npm test

npx shield-ops acceptance check \
  --contract /absolute/worktree/lane-a/acceptance-contract.json \
  --phase red \
  --expected-revision "$(git -C /absolute/worktree/lane-a rev-parse HEAD)" \
  --report /absolute/evidence/lane-a/red-acceptance.json \
  --markdown /absolute/evidence/lane-a/red-acceptance.md
```

Expected outputs are an exact command receipt and a traceability report. A RED
failure is useful only when it proves the intended missing behavior. A dirty
checkout, unexpected passing test, absent criterion, or overwritten output is
a stop condition; correct the contract or construct a new clean boundary
before seeking implementation authority.

### 2. Compile and inspect preflight

```bash
npx shield-ops flight prep /absolute/input/flight-manifest.json \
  --output /absolute/flight/package-v1

npx shield-ops construction check \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/observations/construction-v1.json

npx shield-ops flight doctor \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/observations/doctor-v1.json
```

`flight prep` validates the dependency DAG, lane assignment, writable-path
ownership, exact base, and intended topology. `construction check` observes
whether declared worktrees are absent, clean, dirty, on the wrong branch, or
colliding. Add `--require-created` only after a host has created them.
`flight doctor` composes package, repository, fixture, artifact, and
construction health.

These commands do not create the topology. An absent worktree is a Helicarrier
construction blocker, not permission for the tool or an agent to improvise one.

### 3. Initialize state and compute routing

```bash
npx shield-ops flight state-init \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/state/state-000.json

npx shield-ops flight route \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --state /absolute/flight/state/state-000.json \
  --output /absolute/flight/routes/route-000.json
```

The initial snapshot marks every child `planned` with null revision and
authority evidence. The routing report calculates unmet dependencies,
activation wave, lane occupancy, and legal next-action candidates.

#### State update contract

The current promoted surface has no `flight state-update` command. Do not edit
an existing snapshot in place and do not treat a chat status as state. Until a
validated updater is implemented, the controlling host must create a new,
immutable, sequentially named snapshot after verifying the authoritative child
journal or exact-head receipt. It copies the prior snapshot, changes only the
observed child record, records the exact revision when the status is
`authorized`, `active`, `complete`, or `integrated`, adds the authority-evidence
reference when one exists, and advances `updatedAt`. Hill then runs `flight
route` against that new file.

This host-owned snapshot construction is an explicit unsupported seam, not an
implicit manual-edit workflow. A controller that cannot construct and retain a
new validated snapshot must stop routing. Automating this transition remains
required Feature Flight work.

### 4. Run independently governed child missions

The operator and normal `shield` mission workflow authorize each child against
its fresh exact root, branch, base, HEAD, scope, runtime, and executor binding.
`shield-ops` consumes references to those results but does not create them.

After implementation, capture GREEN and rerun acceptance:

```bash
npx shield-ops evidence run \
  --mission-id mission:example:lane-a \
  --cwd /absolute/worktree/lane-a \
  --artifact artifacts/result.pdf \
  --output /absolute/evidence/lane-a/green-command.json \
  -- npm test

npx shield-ops acceptance check \
  --contract /absolute/worktree/lane-a/acceptance-contract.json \
  --phase green \
  --expected-revision "$(git -C /absolute/worktree/lane-a rev-parse HEAD)" \
  --report /absolute/evidence/lane-a/green-acceptance.json \
  --markdown /absolute/evidence/lane-a/green-acceptance.md
```

GREEN requires exact clean revision evidence and all named manual observations.
A changed contract requires explicit review; it must not be weakened to fit the
implementation.

### 5. Compile handoffs and prove convergence

```bash
npx shield-ops handoff compile \
  --flight-plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --mission-id mission:example:lane-a \
  --mode review \
  --worktree /absolute/worktree/lane-a \
  --state /absolute/evidence/lane-a/handoff-state.json \
  --acceptance-report /absolute/evidence/lane-a/green-acceptance.json \
  --receipt /absolute/evidence/lane-a/green-command.json \
  --output-dir /absolute/flight/handoffs/lane-a-review-v1

npx shield-ops integration check \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --target-mission mission:example:integration \
  --packet /absolute/flight/handoffs/lane-a-review-v1/handoff.json \
  --packet /absolute/flight/handoffs/lane-b-review-v1/handoff.json \
  --output /absolute/flight/integration/readiness-v1.json
```

The handoff state is a compact per-mission record containing its current gate,
decisions, process experiments, created tools, risks, blockers, and recommended
next action; it is distinct from the flight-wide observation snapshot.
Handoffs reject dirty, stale, wrong-branch, failing, or out-of-scope evidence.
Integration checks require every declared dependency packet and reject missing,
stale, unexpected, or path-colliding inputs. A passing report means the inputs
are ready for a separately governed integration action; it does not merge.

### 6. Plan teardown

```bash
npx shield-ops teardown plan \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --integration-ref exact-reviewed-integration-revision \
  --output /absolute/flight/teardown/plan-v1.json
```

The report classifies absent, dirty, wrong-branch, unintegrated, and
integrated-clean worktrees. It never deletes a worktree, branch, artifact, or
journal. The operator chooses a later recoverable removal or explicit
retention. Dirty or unintegrated work is retained and reported as a blocker.

### 7. Harvest experimental tools

```bash
npx shield-ops tool harvest \
  --registry /absolute/flight/tool-registry.json \
  --output /absolute/flight/tool-harvest-v1.json
```

The registry records why each helper was built, inputs, outputs, hash, known
investment, observed reuse, errors prevented, evidence improvement, and an
advisory `discard`, `retain-local`, or `promotion-candidate` disposition.
Unknown measurements remain `null`. Promotion still requires separate scope,
tests, documentation, review, and human publication authority.

## Issue #240 coverage

| Acceptance criterion                                                           | Current disposition                                                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministically scaffold the worktree/branch manifest                        | **Unimplemented.** Preflight validates and observes; Helicarrier does not create.                                                                          |
| Record repository, base, DAG, lane ownership, and integration destination      | **Demonstrated** by the resolved plan and bootstrap receipt.                                                                                               |
| Reuse dependency downloads without shared mutable output or authority          | **Unimplemented.** No isolated dependency-environment constructor exists.                                                                                  |
| Independently authorize, review, validate, receipt, and publish each child     | **Partial.** Evidence and handoffs are demonstrated; authority and publication remain in the separate mission workflow.                                    |
| Prevent downstream execution before integrated dependencies and refreshed base | **Partial.** Routing rejects unmet dependencies; it does not refresh or construct the downstream exact base.                                               |
| Prevent parallel path or shared-contract collisions                            | **Partial.** Path ownership and changed-path collisions fail closed; shared-contract compatibility is not generally compiled.                              |
| Prove contract compatibility and cumulative acceptance at integration          | **Partial.** Exact dependency packets and acceptance evidence are checked; domain-specific compatibility and cumulative execution remain external inputs.  |
| Require separate QA for UI-bearing changes                                     | **Partial.** Named manual evidence is supported; automatic classification and QA authority are not.                                                        |
| Exclude main merge, deployment, release, and human acceptance                  | **Demonstrated** by every promoted tool's non-authoritative boundary.                                                                                      |
| Fail closed with actionable recovery for stale or failed lanes                 | **Partial.** Construction, routing, handoff, integration, and teardown report common failures; relay delivery and automatic recovery remain unimplemented. |
| Feed setup, token, disk, validation, and intervention costs to #161            | **Partial.** The experiment report preserves known values and nulls; automatic telemetry is absent.                                                        |
| Clean or deliberately retain staged worktrees and report recoverability        | **Partial.** Teardown reports recoverability but intentionally performs no cleanup.                                                                        |

The remaining Helicarrier work is therefore concrete: host-owned construction,
isolated dependency environments, validated state transitions, journal-backed
relay delivery, exact downstream-base refresh, and separately authorized
cleanup effects.
