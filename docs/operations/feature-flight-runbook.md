# Feature Flight runbook

This runbook joins the checked-in `shield-ops` helpers into one
non-authoritative operating sequence. The helpers compile observations and
evidence. They never sign, authorize, dispatch, append a mission journal,
publish, merge, deploy, release, clean up, or replace a human gate.

Run every example from the repository root and use the checked-in dispatcher:

```bash
SHIELD_OPS=packages/shield-team-system/scripts/operations/ops-cli.mjs
```

Do not substitute `npx` or a globally installed package: the local path keeps
the command surface bound to the checkout under review. Data and output paths
are absolute because evidence must remain unambiguous across worktrees. Outputs
are create-only, so choose a new path for every replay.

## Roles and authority boundary

- **Operator** runs host commands and relays artifacts but holds no SHIELD gate
  merely by operating the host.
- **Controlling Hill** owns the dependency graph, lane routing, artifact
  references, and concise communication for the whole flight.
- **Lane Hill** coordinates one child mission and replays that mission's
  authoritative journal before acting on a relay or observation.
- **Helicarrier** is the unimplemented host-effect layer intended to construct
  declared worktrees, branches, journals, bindings, and isolated dependency
  environments. These helpers do not perform those effects.

Only the authorized human occupants may decide human gates: Phil Coulson owns
mission and publication authorization and final authority; Leo Fitz performs
required human technical review; Jemma Simmons performs product/domain review
when the mission explicitly requires it. Fury review is technical and
non-authoritative. No operator, Hill, helper, report, model, or runtime may
simulate or infer a Coulson, Fitz, or Simmons decision.

Keep four evidence classes separate:

1. **Structural self-consistency** proves only that a closed artifact satisfies
   its schema and internal bindings.
2. **Exact-snapshot evidence** binds the bytes, paths, Git refs, worktrees, or
   revisions observed during one command. It does not prove latest state.
3. **Trusted authority** comes only from verified, replayed authority evidence
   created by an authorized human occupant through the mission workflow.
4. **Unimplemented effects** remain absent even when a plan or observation
   describes them. A passing report never constructs, refreshes, publishes,
   merges, or cleans up anything.

## End-to-end sequence

```text
acceptance spec + RED evidence
  -> flight package + fixture build/binding/verification
  -> construction observation
  -> state initialization + advisory routing
  -> independently authorized child missions
  -> GREEN evidence + exact-head handoffs
  -> convergence and integration readiness
  -> teardown planning
  -> tool harvest
```

### 1. Freeze acceptance and capture RED

Freeze a closed `mission-acceptance-spec` with one entry for every source
criterion. Automated criteria name command IDs; manual criteria name a
procedure and expected result. Compute the expected digest independently.

```bash
EXPECTED_SPEC_SHA256="$(shasum -a 256 /absolute/worktree/lane-a/acceptance-spec.json | awk '{print $1}')"

node "$SHIELD_OPS" evidence run \
  --spec /absolute/worktree/lane-a/acceptance-spec.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --command-id package-tests \
  --output /absolute/evidence/lane-a/red-command.json
```

After the receipt exists, assemble a closed `mission-evidence-manifest` that
binds its receipt ID, path, SHA-256, criterion, phase, and exact revision. Then
check the complete mapping:

```bash
node "$SHIELD_OPS" acceptance check \
  --spec /absolute/worktree/lane-a/acceptance-spec.json \
  --manifest /absolute/evidence/lane-a/red-manifest.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --phase red \
  --expected-revision "$(git -C /absolute/worktree/lane-a rev-parse HEAD)" \
  --report /absolute/evidence/lane-a/red-acceptance.json \
  --markdown /absolute/evidence/lane-a/red-acceptance.md
```

A RED failure is useful only when it proves the intended missing behavior. A
dirty checkout, unexpected pass, absent criterion, stale digest, or existing
output is a stop condition.

### 2. Compile the flight package

```bash
node "$SHIELD_OPS" flight prep /absolute/input/flight-manifest.json \
  --output /absolute/flight/package-v1
```

`flight prep` validates and freezes the DAG, lane assignment, writable-path
ownership, exact base, intended topology, evaluation contract, launch packets,
and bootstrap receipt. This is structural and exact-snapshot evidence; it does
not scaffold the declared topology.

### 3. Preflight, build, bind, and verify the fixture

Ghostscript is a required fixture dependency. Preflight it before choosing a
new output directory:

```bash
command -v gs
gs --version

node "$SHIELD_OPS" fixture build \
  --output /absolute/flight/fixture-v1
```

The builder repeats the Ghostscript version check before creating output and
emits a closed fixture manifest and build receipt. A flight assembly process
must then add a closed `fixture-binding.json` beside
`flight-plan.resolved.json`. The binding has exactly these fields:
`schemaVersion`, `bindingType`, `authority`, `flightId`, `fixtureId`,
`fixtureVersion`, `classification`, `containsCustomerData`, `manifestPath`, and
`manifestSha256`. Version 1 uses
`bindingType: feature-flight-fixture-binding`, `authority: none`, the canonical
absolute fixture-manifest path, and the SHA-256 of those exact manifest bytes.
Binding is an explicit assembly step, not a `shield-ops` command and not an
authority act.

Verify package and fixture closure with doctor, writing the report outside the
closed package:

```bash
node "$SHIELD_OPS" flight doctor \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/observations/doctor-v1.json
```

Doctor verifies the fixture identity, classification, exact manifest binding,
build receipt, tool hash, Ghostscript version, package inventory, repository,
and construction observations. A healthy report is still non-authoritative.

### 4. Observe construction

```bash
node "$SHIELD_OPS" construction check \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/observations/construction-v1.json
```

Without `--require-created`, absent worktrees are observations. After an
authorized host has constructed the topology, replay to a new output with
`--require-created`. Wrong branches, dirty worktrees, wrong heads, ancestry
drift, and collisions fail closed. The command never creates or repairs them.

### 5. Initialize state and compute advisory routing

```bash
node "$SHIELD_OPS" flight state-init \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --output /absolute/flight/state/state-000.json

STATE_SHA256="$(shasum -a 256 /absolute/flight/state/state-000.json | awk '{print $1}')"

node "$SHIELD_OPS" flight route \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --state /absolute/flight/state/state-000.json \
  --expected-state-sha256 "$STATE_SHA256" \
  --expected-state-sequence 0 \
  --output /absolute/flight/routes/route-000.json
```

The genesis snapshot marks every child `planned` with null revision and
authority evidence. Routing computes unmet dependencies, wave, lane occupancy,
and advisory candidates. For every successor, also supply the exact predecessor
file and independently expected predecessor digest.

#### State update contract

The checked-in surface has no `flight state-update` command. Never edit a
snapshot in place or treat chat status as state. A controlling host may assemble
a new immutable successor only after checking its source evidence, sequence,
predecessor digest, plan identity, and permitted transition. The router then
validates that successor against the exact predecessor. This proves structural
self-consistency and expected bytes, not freshness or trusted authority. If the
host cannot retain the source evidence or establish the next immutable
snapshot, routing stops. A supported validated successor producer and trusted
journal verifier remain unimplemented.

### 6. Run independently governed child missions

Phil Coulson's authorized human occupant must grant each child its required
mission and implementation authority against a fresh exact root, branch, base,
HEAD, scope, runtime, and executor binding. Fitz and conditional Simmons gates
remain separately satisfied by their authorized human occupants. The
`shield-ops` artifacts neither create nor satisfy those gates.

After implementation, run the GREEN command declared by the unchanged spec,
assemble a GREEN evidence manifest retaining required RED evidence, and replay
acceptance:

```bash
node "$SHIELD_OPS" evidence run \
  --spec /absolute/worktree/lane-a/acceptance-spec.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --command-id package-tests \
  --output /absolute/evidence/lane-a/green-command.json

node "$SHIELD_OPS" acceptance check \
  --spec /absolute/worktree/lane-a/acceptance-spec.json \
  --manifest /absolute/evidence/lane-a/green-manifest.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --phase green \
  --expected-revision "$(git -C /absolute/worktree/lane-a rev-parse HEAD)" \
  --report /absolute/evidence/lane-a/green-acceptance.json \
  --markdown /absolute/evidence/lane-a/green-acceptance.md
```

### 7. Record and compile exact handoffs

First record a closed mission status snapshot:

```bash
node "$SHIELD_OPS" handoff state \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --mission mission:example:lane-a \
  --worktree /absolute/worktree/lane-a \
  --status /absolute/evidence/lane-a/closed-status.json \
  --sequence 0 \
  --output /absolute/evidence/lane-a/handoff-state-000.json

HANDOFF_STATE_SHA256="$(shasum -a 256 /absolute/evidence/lane-a/handoff-state-000.json | awk '{print $1}')"

node "$SHIELD_OPS" handoff compile \
  --flight-plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --mission-id mission:example:lane-a \
  --mode review \
  --worktree /absolute/worktree/lane-a \
  --state /absolute/evidence/lane-a/handoff-state-000.json \
  --expected-state-sha256 "$HANDOFF_STATE_SHA256" \
  --expected-state-sequence 0 \
  --acceptance-report /absolute/evidence/lane-a/green-acceptance.json \
  --evidence-manifest /absolute/evidence/lane-a/green-manifest.json \
  --receipt /absolute/evidence/lane-a/green-command.json \
  --output-dir /absolute/flight/handoffs/lane-a-review-v1
```

Successors require predecessor state and its independently expected digest.
The compiler rejects stale, dirty, wrong-branch, failing, aliased, or
out-of-scope evidence and recomputes acceptance semantics. It does not transfer
ownership or create review authority.

### 8. Prove convergence readiness

```bash
node "$SHIELD_OPS" integration check \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --target-mission mission:example:integration \
  --packet /absolute/flight/handoffs/lane-a-review-v1/handoff.json \
  --packet /absolute/flight/handoffs/lane-b-review-v1/handoff.json \
  --output /absolute/flight/integration/readiness-v1.json
```

A passing report proves the supplied dependency set and replayed exact snapshots
meet the closed integration contract. It does not prove domain compatibility
unless the supplied acceptance evidence tests it, does not run cumulative tests,
and does not authorize or perform integration.

### 9. Plan recoverable teardown

```bash
node "$SHIELD_OPS" teardown plan \
  --plan /absolute/flight/package-v1/flight-plan.resolved.json \
  --integration-ref refs/heads/exact-planned-integration-branch \
  --archive-evidence /absolute/flight/archive/lane-a.json \
  --output /absolute/flight/teardown/plan-v1.json
```

The integration ref must exactly name the plan's full integration branch ref.
The report classifies recoverability and checks optional external archive
evidence. It never deletes a worktree, branch, artifact, or journal. Phil
Coulson retains final authority over any later cleanup effect.

### 10. Harvest experimental tools

```bash
node "$SHIELD_OPS" tool harvest \
  --registry docs/experiments/nxt-449-tool-registry.json \
  --output /absolute/flight/tool-harvest-v1.json
```

The registry uses a portable registry-relative repository root and
repository-relative tool paths. The report binds the exact registry bytes and
each tool's exact bytes. Unknown measurements remain `null`; a recommendation
does not grant promotion or publication authority.

## Issue #240 acceptance matrix

The criteria below preserve the issue's acceptance wording. “Structural” and
“snapshot” do not imply trusted authority or an implemented host effect.

| Acceptance criterion                                                                                                                      | Evidence class and current disposition                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One command or host operation can scaffold the declared Feature Flight worktree/branch manifest deterministically.                        | **Unimplemented effect.** `flight prep` deterministically compiles the manifest, but no checked-in operation scaffolds worktrees or branches.                                                                               |
| Bootstrap records exact repository identity, base revision, issue dependency graph, lane ownership, and intended integration destination. | **Structural + exact snapshot: implemented.** The resolved plan and bootstrap receipt bind these values at preparation time; they grant no authority.                                                                       |
| Dependency downloads may reuse a content cache without sharing mutable build output or authority.                                         | **Unimplemented effect.** No isolated dependency-cache preparation or mutable-output isolation host exists.                                                                                                                 |
| Each child remains independently authorized, reviewed, validated, receipted, and publishable.                                             | **Partial.** Receipts, acceptance reports, and handoffs provide structural and exact-snapshot evidence. Coulson, Fitz, and conditional Simmons authority and publication stay in the separate trusted mission workflow.     |
| A downstream child cannot execute until its declared predecessors are integrated and its exact base is refreshed.                         | **Partial structural check; trusted verification and effect absent.** Routing reports unmet dependencies but cannot verify authoritative integration or refresh the downstream base.                                        |
| Parallel lanes cannot silently modify the same owned path or incompatible shared contract.                                                | **Partial.** Ownership and exact changed-path collisions fail closed. General shared-contract compatibility is not compiled or enforced.                                                                                    |
| The integration gate proves backend/frontend contract compatibility and cumulative acceptance criteria.                                   | **Partial exact-snapshot evidence.** Integration replays declared packet and acceptance evidence; domain compatibility and cumulative command execution must be supplied externally and are not effects of the checker.     |
| UI-bearing changes can require the separate QA gate before publication.                                                                   | **Partial.** Specs can require named manual evidence, but UI classification and the conditional Simmons/QA authority gate are not created by these tools.                                                                   |
| Main, merge-to-main, deployment, release, and human acceptance remain excluded from swarm authority.                                      | **Implemented boundary.** Every artifact carries `authority:none`, and no helper exposes those effects; authorized human decisions remain separate.                                                                         |
| Stale worktrees, context loss, lane failure, dependency changes, and integration conflicts fail closed with actionable recovery.          | **Partial.** Snapshot, construction, routing, handoff, integration, and teardown checks reject covered stale or conflicting evidence; journal-backed relay recovery and automatic dependency/base repair are unimplemented. |
| Setup-time, token, disk, validation, and intervention costs can feed collaboration evidence under #161.                                   | **Partial structural support.** The harvest preserves declared measurements and explicit nulls, but automatic collection for these cost classes is unimplemented.                                                           |
| End Feature Flight cleans or deliberately retains staged worktrees and reports recoverability.                                            | **Partial exact-snapshot evidence; cleanup effect absent.** Teardown reports retention/recoverability and fails closed around unsafe candidates, but performs no cleanup.                                                   |

The remaining host work is explicit: deterministic construction, isolated
dependency environments, a validated successor-state producer, trusted
journal-backed authority and relay verification, exact downstream-base refresh,
domain/cumulative integration execution, cost telemetry, and separately
authorized cleanup effects.
