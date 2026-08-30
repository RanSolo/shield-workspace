# Mission Rail V1 architecture

Status: proposed bootstrap architecture  
Authority model: Track-Layer construction through Factory Missions; ordinary Git, Nx, review, and pull-request controls  
Migration posture: parallel replacement, not an in-place rewrite

## Decision

Build one small, complete mission rail beside the current SHIELD runtime. Keep
the existing runtime operational, use it as a source of proven algorithms and
characterization tests, and migrate only behavior that is consciously accepted.

The new rail is not required to govern its own construction. Factory is the
primary construction host. The SHIELD seat model still organizes specialist
responsibilities, but construction uses Factory Spec and Mission modes,
ordinary branches, cached Nx targets, exact-revision review, and pull requests.
Codex remains an advisor and independent audit surface. Dogfooding begins when
the new rail can carry its first complete issue.

## Problem being solved

The current repository contains valuable behavior, but delivery mechanics and
governance evolved together inside `@shield/team-system`. This produced three
operational failures:

1. a corrected rail can be merged without every lane adopting its revision;
2. completed code can remain stranded in a persistent worktree without a PR;
3. recovery and compatibility contracts can prevent a clean lane from reaching
   the next ordinary action.

The failure is primarily lifecycle composition, not a lack of individual
guards. Adding more guards to the existing composition does not establish a
small, auditable happy path.

## Existing workspace baseline

Current `origin/main` contains three Nx projects:

- `@shield/team-system` — CLI, host adapters, governance, stores, execution,
  compatibility paths, and most public surfaces;
- `@shield/mission-preparation` — dependency-free canonical contracts and pure
  preparation compilation;
- `@shield/multiband` — downstream consumer and proving surface.

`@shield/mission-preparation` is retained as reusable prior art. Its canonical
JSON, digest, content-identity, pure compilation pattern, package-boundary
tests, and offline installation tests are strong. Its schema-9,
Wheels-Up-specific V1 contract graph is treated as a legacy contract, not as a
mandatory shape for the new rail.

## Product objective

Carry one issue through this complete path:

```text
issue intake
  -> plan
  -> technical plan review
  -> human implementation approval
  -> implementation
  -> independent validation
  -> conformance review
  -> draft pull request
  -> lane reconciliation
```

The rail owns mechanical progress. Agents make bounded judgments at explicit
seams. Humans decide only meaningful gates. A stopped operation always says
whether it needs human judgment, external capability, corrected evidence, or a
software repair.

## Design principles

1. **One deterministic next operation.** Given durable mission state and a
   fresh observation, the rail returns exactly one automatic action, human
   gate, external blocker, terminal result, or closed recovery instruction.
2. **No caller-authored authority packets.** Software derives machine payloads
   from the accepted plan, observed repository state, and recorded decision.
3. **Human-readable gates.** Every gate explains the decision and emits one
   copy-safe command or UI action. Multiline shell fragments are projections,
   never the canonical contract.
4. **Completion includes delivery.** A mission cannot report complete while
   unique commits exist only in a lane. It must record merged, published, or
   explicitly archived disposition.
5. **Stable lanes are first-class.** Alpha, Bravo, and Charlie retain stable
   filesystem paths. Assignment rotates; the worktree path does not.
6. **Follow-ups do not occupy delivery lanes.** After draft publication, PR
   corrections use the repository's review-follow-up checkout while the stable
   lane reconciles for its next mission.
7. **Trusted-host threat model.** The local OS account, repository host, and
   installed toolchain are trusted. The rail protects against accidental drift,
   stale state, malformed inputs, unsafe links, ambiguous identity, and agent
   misuse; it does not attempt to defeat a malicious same-user process racing
   filesystem namespaces.
8. **Nx is the execution graph.** Focused and affected targets run with normal
   cache behavior. Direct test-runner commands are diagnostic exceptions, not
   the default validation path.
9. **Adapters preserve identity.** Codex, GitHub Copilot, Factory Droid, local
   model, and future hosts consume the same seat and task contracts while
   recording the actual executor and model.
10. **Compatibility stays outside the kernel.** Legacy journals, schemas, and
    recovery paths are translated by adapters or left in the existing runtime.
11. **Maintainability is executable.** Every package has focused build, test,
    typecheck, lint, dependency-boundary, and SonarQube analysis from its first
    production change. Code-smell evidence is part of milestone completion.
12. **Small is the default.** Components own one cohesive capability; modules
    expose narrow interfaces; functions perform one named transformation.
    Crossing the documented size/complexity thresholds requires a recorded
    split decision or explicit architectural exception.
13. **Governance enables velocity.** The default eligible transition advances
    automatically. Advisory evidence does not become a stop. The rail stops
    only for a meaningful human decision, an unauthorized irreversible effect,
    contradictory identity/evidence, or unavailable external capability.
    Known correctable failures route through a deterministic switch and rejoin
    the main path.
14. **The rail is reference-quality software.** Architecture, source, tests,
    static analysis, documentation, and the proving trace must be suitable for
    demonstrating the engineering standard of the team that built it. A
    successful prototype with hidden coupling or unexplained debt is not V1.
15. **Humans can keep up.** Guided Review renders plans, exact code changes,
    and QA scenarios as small acceptance-criterion-aligned sections. Coulson
    can understand, question, revise, approve, or record an observed QA outcome
    without reading transcripts or raw protocol JSON. The view is a projection
    over canonical state, not a second workflow engine.

## Proposed package boundaries

```text
canonical-contract   -> []
mission-rail         -> [canonical-contract]
guided-review        -> [canonical-contract, mission-rail]
lane-lifecycle       -> [canonical-contract]
mission-store        -> [canonical-contract, mission-rail]
mission-projection   -> [canonical-contract, mission-rail, mission-store,
                         lane-lifecycle, guided-review]
mission-host         -> [canonical-contract, mission-rail, mission-store,
                         lane-lifecycle]
team-system          -> [mission-host, mission-projection,
                         mission-preparation (retained legacy), legacy adapters]
```

The arrows point from a package to its dependencies. `mission-rail` and
`lane-lifecycle` are pure.
`mission-store` owns event codecs and replay but performs no I/O. All JSONL,
Git, filesystem, GitHub, process, model, and signer effects live in
`mission-host`.

### `@shield/canonical-contract`

Owns canonical JSON, deterministic digests, content IDs, closed-result helpers,
and primitive validators. Begin by surgically extracting the proven neutral
parts of `@shield/mission-preparation/canonical-json-v1.mts` with their tests.
No Git, filesystem, seat, mission-phase, or authority concepts are allowed.

### `@shield/mission-rail`

Owns the pure mission model and transition function. It has no filesystem,
process, network, GitHub, signer, model, or clock access.

The minimum state model is:

```text
intake -> planning -> awaiting_plan_review
       -> awaiting_implementation_approval
       -> implementing -> validating -> conforming
       -> awaiting_code_review -> publishing -> awaiting_qa
       -> delivered -> reconciled
```

`blocked`, `cancelled`, and `archived` are terminal dispositions with explicit
recovery or successor semantics. A transition never silently manufactures a
new mission to escape incompatible state.

The public `next` result is a closed union:

```text
automatic | human_gate | external_blocker | repair_required | complete
```

Each result includes a stable reason code, concise human projection, required
inputs, permitted effect, and expected successor state.

Entry into `awaiting_implementation_approval` requires a Fury PASS bound to the
exact plan digest and repository base/tree. Human approval binds that reviewed
plan, owned paths, permitted implementation and draft-publication effects, and
explicit merge/deploy/release/destructive exclusions. A plan change invalidates
the review and approval; an implementation-head change invalidates only
revision-bound validation and conformance evidence.

Publication requires an approved Guided Code Review bound to the exact
candidate revision. `delivered` and `reconciled` require a Guided QA PASS bound
to that same candidate. A changed candidate invalidates code-review and QA
outcomes without invalidating the accepted epic or plan.

### `@shield/guided-review`

Owns the lightweight human review contract for three review kinds:

```text
plan | code | qa
```

It projects a Fury-reviewed plan, an exact implementation diff, or executable
QA scenarios into ordered, acceptance-criterion-aligned sections. Plan sections
show scope, exclusions, commands, risks, and unresolved assumptions. Code
sections show the approved requirement, changed files, behavior, and review
evidence. QA sections show setup, action, expected result, observed result, and
retained evidence.

Plan and code sections use the closed decision union `accept | question |
revise`. Their aggregate is deterministic: any `revise` yields
`revision_requested`; otherwise any `question` or missing required decision
yields `incomplete`; otherwise all required sections accepted yields
`approved`.

QA separates scenario design from execution. A scenario definition first uses
the same `accept | question | revise` decision and aggregation. An accepted
scenario execution then records `pass | fail | blocked`. QA aggregate
precedence is: any mandatory `fail` yields `failed`; otherwise any mandatory
`blocked` yields `blocked`; otherwise any unaccepted scenario, missing outcome,
or missing required evidence yields `incomplete`; otherwise every mandatory
scenario passing yields `passed`. Optional scenarios are reported but cannot
overturn the mandatory aggregate.

The library produces typed review decisions and deterministic aggregate
dispositions. Plan and code reviews yield `approved`, `revision_requested`, or
`incomplete`; QA yields `passed`, `failed`, `blocked`, or `incomplete`.
Decisions bind the exact subject digest and repository revision. Every
mandatory QA PASS record contains setup, action, expected result, observed
result, visible retained-evidence references, operator identity, and exact
candidate revision. A revision
returns to the accountable specialist with the human's comments intact; a
changed subject cannot inherit approval. It contains no signer, filesystem,
browser, journal, or dispatch code.

The first adapter is intentionally small: a terminal-readable document plus a
single static HTML view with plain JavaScript. Both consume and emit the same
versioned JSON contract for all three review kinds. Closing the browser loses
no canonical state, and no UI event can grant authority by itself.

### `@shield/mission-store`

Owns closed event codecs, snapshots, deterministic replay, optimistic sequence
checks, and evidence references. It stores and replays facts; it does not decide
the next action and performs no I/O. The first host adapter may persist these
events as repository-local JSONL and canonical JSON. No database is required
for V1.

The minimum event envelope contains mission ID, schema version, contiguous
sequence, predecessor digest, event ID, canonical event digest, optional effect
ID, exact repository tuple, artifact revision, accountable seat ID, host kind,
reasoning runtime ID, model ID, tool-executor ID, and Mission/feature/run
identity.

An observation envelope contains observation ID and canonical digest, subject,
observed repository tuple, accepted-event sequence and digest, predecessor
observation digest, monotonically increasing host-supplied observation ordinal,
host-observed timestamp, and repository relation to the accepted tuple:
`same | descendant | diverged | unknown`. The pure store does not read clocks
or Git. It accepts only `same` or `descendant` with the exact current event
watermark and next observation ordinal.

Replay treats the same ID and same digest as an idempotent duplicate; the same
ID with a different digest is a conflict. It rejects sequence gaps, unknown
versions, incorrect predecessor/event watermarks, non-increasing observation
ordinals, `diverged` or `unknown` lineage, and snapshot/log terminal
sequence-or-digest disagreement. An uncertain effect may advance only through
a fresh reconciliation observation bound to effect and attempt IDs with
`succeeded | failed | still_uncertain`; it is never blindly repeated.

### `@shield/lane-lifecycle`

Owns persistent delivery lanes and ephemeral worktrees:

```text
ready -> assigned -> active -> published -> reconciling -> ready
```

Required operations are `prepare`, `assign`, `status`, `reconcile`, `retire`,
and `doctor`.

- `reconcile` preserves Alpha/Bravo/Charlie paths, proves the delivered branch
  is published, merged, or archived, clears mission-local state, moves to the
  selected exact base, installs current policy, and emits a fresh receipt.
- `retire` removes only clean ephemeral worktrees whose commits are merged or
  explicitly archived.
- neither operation deletes dirty or uniquely committed work;
- changing a clean durable lane's branch is a supported lifecycle transition,
  not a `predecessor_branch_mismatch` dead end.

### `@shield/mission-host`

Owns side effects and observations: Git, filesystem, GitHub, issue adapters,
agent dispatch, model/runtime identity, signing, clocks, and process execution.
It implements ports defined by the rail and lane libraries. Host failures do
not change pure state until a durable result is recorded.

Every external effect has a deterministic idempotency key and durable
`claimed | succeeded | failed | uncertain` record. Retry first observes the
existing result and never repeats a succeeded or uncertain effect blindly.

### `@shield/mission-projection`

Owns the pure read model consumed by terminal status, CLI, and Mission Control.
It converts validated rail and lane events into stable views:
mission phase, lane state, exact revision, active seat/run, blocker class,
human gate, validation state, publication state, and one recommended action.
It cannot write journals, grant authority, dispatch agents, or perform effects.

`mission-projection` consumes validated Guided Review aggregate facts. Mission
Control and the CLI read this projection and submit typed commands to
`mission-host`; they never mutate state directly. Guided Review renders its own
review contract and contributes typed decisions through the host command
boundary; it does not import `mission-projection`. UI loss therefore cannot
lose canonical mission state.

### `@shield/team-system`

Becomes the thin CLI, compatibility shell, and public integration package. Old
commands may call legacy implementations until replaced. New commands call the
new libraries and expose their projections without recreating policy in the
CLI.

## Seat and autonomy model

The seat contracts remain useful independently of the current runtime:

- Hill owns issue scope, sequencing, lane assignment, and exception routing.
- Daisy gathers missing repository and issue evidence without mutation.
- Fury reviews exact plans and implementation conformance.
- May owns bounded implementation.
- Mack validates the exact candidate through the smallest sufficient Nx graph.
- Coulson, Fitz, and Simmons remain human seats and are never simulated.

Before the construction GO gate, architecture, package ownership, issue
dependencies, acceptance criteria, and excluded behavior are frozen. After GO,
teams may autonomously create implementation branches, modify owned paths, run
cached Nx targets, route seat reviews, push branches, and open draft PRs. They
stop only for:

- a material architecture or scope change;
- a meaningful human authorization or acceptance decision;
- missing credentials or external capability;
- contradictory evidence that software cannot resolve deterministically;
- destructive, merge, deployment, or release effects not explicitly granted.

For Track-Layer construction, this is **Epic Wheels Up**: one human GO binds the
accepted architecture, dependency-ordered issue graph, owned-path union,
quality milestones, effect envelope, budget/expiry, and explicit exclusions.
Within that envelope Hill may cycle crews through issues, corrections,
validation, and draft PR publication without a new PIN or planning ceremony per
issue. Adding an issue is automatic only when it is a bounded correction inside
the accepted outcome and owned-path union; a new product outcome, expanded
paths, destructive effect, merge, deployment, or release requires amendment or
separate authority.

Ordinary Delivery Mode keeps lightweight Guided Plan, Code, and QA review per
issue. Track-Layer Mode reviews the epic architecture and envelope before GO,
then uses milestone review and one complete Guided Code Review and Guided QA at
epic completion. A material divergence triggers review when discovered; routine
issue boundaries do not repeatedly stop the construction train.

Factory evidence keeps responsibility and execution separate. Every dispatch,
review, validation, and completion record includes `accountable_seat_id`, host
kind, reasoning runtime ID, model ID, tool-executor ID, and Mission/feature/run
identity. A Droid name or generated nickname is display metadata only. Mack
independence requires a distinct run identity and no implementation write set.

## Factory construction program

Factory receives the architecture and issue graph as a bounded Mission rather
than a single open-ended rewrite prompt.

### Repository bootstrap

- Keep root `AGENTS.md` concise and authoritative for package manager, Node
  version, Nx commands, repository boundaries, and completion proof.
- Add nested `AGENTS.md` only when a new package has genuinely different
  commands or ownership rules.
- Define project Droids under `.factory/droids/` for Hill, Daisy, Fury, May,
  and Mack only when their tool/model policies materially differ. Do not copy
  long seat documentation into every Droid; link to the canonical seat
  contract.
- Store machine-local model, credential, and autonomy choices in
  `.factory/settings.local.json`, excluded from Git.
- Keep task-specific context in GitHub issues and architecture documents, not
  in `AGENTS.md` or private chat history.

### Planning and GO

1. Start in Factory Spec Mode with this architecture and the umbrella issue.
2. Require Factory to reproduce the issue dependency graph, package ownership,
   validation milestones, exclusions, and estimated worker/validator runs.
3. Resolve material differences in the spec before execution.
4. Human GO approves the Factory Mission plan and selected autonomy level.
5. Record Epic Wheels Up with the accepted feature graph, owned-path union,
   milestones, effect envelope, budget/expiry, and exclusions.
6. Execute in Mission Mode. Use the highest autonomy permitted by organization
   policy only after the bounded plan is accepted. Continue through every
   in-envelope feature and correction without asking for per-issue GO.

### Mission milestones

Factory features map one-to-one to manifest feature IDs and their generated
delivery issues. The manifest is the sole accepted dependency graph; GitHub
issues are indexed delivery views and cannot silently alter it. Validation
happens at three integration milestones rather than after every tiny baton pass:

| Milestone | Features | Required validation |
| --- | --- | --- |
| Foundation | quality harness, canonical contract, mission rail, Guided Review | focused package builds/tests, property and mutation targets, graph boundary, cache proof, Sonar gate, Fury architecture check |
| Lifecycle | mission store, mission-host scaffold, persistent lane lifecycle | focused package builds/tests, property and mutation targets, package surface, filesystem-backed lane rehearsal, Mack exact-revision validation |
| Vertical flight | host composition, thin CLI, proving issue | affected build/test with cache, end-to-end flight, Mack validation, Fury conformance |

Parallel work is allowed only for features with disjoint owned paths and no
unsettled contract dependency. A worker that needs an upstream contract waits
for the milestone artifact instead of inventing a private shape.

### Factory executable issue packet

Every issue contains these headings:

```text
Outcome
Architecture source and exact base
Depends on
Owned paths
Inputs and reusable legacy sources
Required behavior
Explicit exclusions
Factory execution notes
Nx validation commands
Required artifacts
Terminal handoff
```

`Factory execution notes` name the preferred mode, feature/milestone, safe
autonomy envelope, allowed parallelism, and specialist Droid handoffs. The
packet must remain executable by another host; Factory-specific settings are
advice, not product contracts.

Every feature starts from an exact integration commit/tree containing all
accepted dependencies. After milestone validation, the parent Factory Mission
records an integration receipt and advances the integration base. It then
regenerates downstream packet identities. Base/tree mismatch fails closed.
Mechanical advancement remains inside GO only when feature scope, owned paths,
effects, and dependency edges are unchanged.

Epic Wheels Up emits the genesis `integration-receipt.v1`, bound to the GO,
architecture revision, and manifest digest; its candidate tree is the accepted
architecture tree and it supplies MR-000's exact base. Every later feature uses
the terminal accepted integration receipt. Revision resolution is non-cacheable
and writes a locally ignored content-addressed input keyed by receipt and HEAD
digests. Every consuming target revalidates those bindings before work, so
successive bases cannot overwrite or accidentally reuse one another.

## Executor portability

Repository task packets are the source of truth. They contain objective,
owned paths, exact base, inputs, exclusions, expected outputs, validation
targets, and terminal handoff. They do not depend on chat history.

This shape supports:

- Codex named agents backed by `.codex/agents/`;
- GitHub Copilot repository agents backed by `.github/agents/`;
- Factory project Droids backed by `.factory/droids/`;
- local-model adapters for eligible seats.

Factory is the primary construction and proving host because custom Droids
provide isolated context, per-role model/tool policy, repository-local
definitions, CLI/headless execution, MCP context, and persistent Missions and
automations. The construction setup maps seat contracts into
`.factory/droids/`; the mission rail itself must not import Factory-specific
APIs.

## Legacy audit and extraction protocol

Every candidate behavior receives one disposition before migration:

| Disposition | Meaning |
| --- | --- |
| keep | Proven invariant required by the new happy path. |
| simplify | Correct protection or behavior with excessive machinery. |
| replace | Required capability whose implementation boundary is defective. |
| drop | Legacy or threat-model behavior no longer aligned with the product. |
| defer | Valuable behavior not required for the first complete flight. |

Extraction rules:

1. Do not copy a module before naming the invariant it preserves.
2. Prefer pure functions and tests over host orchestration code.
3. Port the smallest passing characterization cohort.
4. Replace internal identities with the new package's vocabulary at the
   boundary; do not spread compatibility fields inward.
5. Record source commit and source path for provenance, but the extracted code
   is owned and evolved by its new package.

## Delivery sequence

### Flight 0 — architecture and audit harness

- Accept this architecture and issue dependency graph.
- Add a machine-readable legacy disposition ledger.
- Add the `mission-rail-quality` Nx project with named targets for revision
  resolution, packet verification, affected validation, cache proof, package
  surfaces, Sonar scan/gate, and the proving flight.
- Add the minimal Factory project-Droid and Mission bootstrap material needed
  to execute the remaining flights from repository context.

### Flight 1 — canonical contract extraction

- Generate `@shield/canonical-contract` through the repository Nx generator.
- Extract neutral canonicalization and identity behavior with tests.
- Leave `@shield/mission-preparation` exports, dependencies, tarball, and
  offline-install behavior unchanged through Flight 5. Extract from its pinned
  source commit; do not redirect the legacy package to the new library yet.

### Flight 2 — pure mission rail

- Implement the minimal mission state, events, `next` union, and table-driven
  happy-path tests.
- Implement the closed Guided Review plan/code/QA contract and static adapters.
- Prove no host imports, deterministic transitions, exact review binding, and
  property/mutation coverage of the critical state kernel.

### Flight 3 — store, lane lifecycle, and minimum host adapters

- Implement closed event/observation codecs and deterministic replay.
- Scaffold `@shield/mission-host` and freeze its typed ports before any adapter
  feature writes a subpath.
- Implement persistent-lane
  assignment/reconciliation, and ephemeral retirement.
- Implement only the Git/filesystem adapters required for a real disposable
  lane rehearsal.
- Reproduce and close the observed `predecessor_branch_mismatch` lifecycle gap.

### Flight 4 — projection and broader host composition

- Persist rail events and observations through the host adapter.
- Implement the pure Mission Control projection plus GitHub, process,
  dispatch, and human-gate adapters.
- Derive all machine packets; callers supply decisions, not internal JSON.

### Flight 5 — thin CLI and first proving issue

- Expose `mission begin`, `mission next`, `mission status`, and lane commands.
- Carry one curated real issue through the complete path.
- Verify the draft PR exists and the stable lane returns to `ready`.
- Launch the exact candidate against a disposable but real proving environment.
- Demonstrate at least one visible operator journey from issue intake through
  the delivered behavior; retain a concise transcript, screenshots or video,
  expected/observed results, and exact revision binding.
- Record elapsed time, human interruptions, cache results, and every repair edge.

Only after Flight 5 may existing commands be redirected or legacy code removed.

## First-flight acceptance criteria

- A cold Hill can begin a named issue without composing JSON.
- The system always identifies the current phase and one legal next action.
- Plan and implementation reviews bind to exact revisions.
- One meaningful implementation approval authorizes the bounded work.
- One Epic Wheels Up authorizes cycling through the accepted Track-Layer issue
  graph and bounded corrections through draft PRs without per-issue PINs.
- May and Mack use focused or affected Nx targets with cache enabled.
- Draft PR publication requires no redundant PIN after bounded implementation
  publication was approved.
- No successful mission ends with unique commits only in a local lane.
- Alpha/Bravo/Charlie can accept another mission without changing paths or
  deleting installed dependencies.
- The same task packet can be executed by a Codex seat or Factory Droid while
  preserving actual runtime identity.
- Guided QA visibly demonstrates the exact candidate working in a real proving
  scenario. A checklist, mocked unit test, or prose claim alone cannot PASS.
- QA evidence records setup, action, expected result, observed result, retained
  artifact references, operator disposition, and exact candidate revision.
- Legacy SHIELD remains runnable until an explicitly reviewed migration removes
  it.

## Explicit non-goals

- Reproducing every schema-9 transition before the first flight.
- Preserving every historical journal or temporary-worktree recovery path.
- Defending against malicious same-user namespace races.
- Hosting Mission Control, mobile PIN entry, deployment, or release.
- Automatically merging pull requests.
- Building a general workflow engine or adopting a database in V1.

## GO gate

GO is Epic Wheels Up. It means this document, the dependency-ordered issue set,
and Factory's rendered Mission plan are accepted. It authorizes autonomous Track-Layer construction
through draft PRs under each issue's owned paths and acceptance criteria, using
the selected Factory autonomy level within organization policy. It does not
authorize merge, deployment, release, destructive migration, or deletion of
the existing SHIELD runtime.

The recorded GO identity contains the architecture Git revision, architecture
file digest, machine-readable feature-manifest digest, rendered Factory Mission
plan digest, accepted feature IDs, owned-path union, milestones, allowed and
excluded effects, budget/expiry, selected autonomy level, accountable human
identity, and timestamp.
