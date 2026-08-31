# Mission Rail V1 architecture

Status: proposed bootstrap architecture
Authority model: Track-Layer construction through a supported execution host;
ordinary Git, cached validation, review, and publication controls
Migration posture: parallel replacement, not an in-place rewrite

## Decision

Build one small, complete mission rail beside the current SHIELD runtime. Keep
the existing runtime operational, use it as a source of proven algorithms and
characterization tests, and migrate only behavior that is consciously accepted.

The new rail is not required to govern its own construction. A supported
execution host receives the architecture and manifest feature graph as one bounded
execution program. Factory is the first construction host, while Codex remains an advisor
and independent audit surface. Both use ordinary branches, cached Nx targets,
exact-revision review, pull requests, and the same host-neutral task contracts.
Dogfooding begins when the new rail can carry its first complete issue.

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
  -> Guided Plan Review
  -> human implementation approval
  -> implementation
  -> independent validation
  -> conformance review
  -> Guided Code Review
  -> draft review publication
  -> lane reconciliation and review-follow-up checkout
  -> Guided QA
  -> delivered disposition
```

The rail owns mechanical progress. Agents make bounded judgments at explicit
seams. Humans decide only meaningful gates. A stopped operation always says
whether it needs human judgment, external capability, corrected evidence, or a
software repair.

## Design principles

1. **One deterministic next operation.** Given durable mission state and a
   fresh observation, the Rail returns exactly one automatic action, human
   gate, external blocker, terminal result, or closed recovery instruction.
   When novelty leaves no safe deterministic answer, it gathers the relevant
   evidence and routes a bounded judgment to Hill and Fury; their recorded
   decision produces a deterministic successor that rejoins the Rail.
2. **No caller-authored authority packets.** Software derives machine payloads
   from the accepted plan, observed repository state, and recorded decision.
3. **Human-readable gates.** Every gate explains the decision and emits one
   copy-safe command or UI action. Multiline shell fragments are projections,
   never the canonical contract.
4. **Completion includes delivery.** A mission cannot report complete while
   unique commits exist only in a lane. It must record merged, published, or
   explicitly archived disposition.
5. **Stable lanes are operationally ready.** Configured delivery lanes retain
   stable filesystem homes while assignments rotate. Reconciliation correctly
   retires prior mission state, restores the intended branch and revision,
   validates dependencies and toolchain readiness, and leaves the application
   ready to build, run, and QA. Signer enrollment and trusted-host setup
   persist, but mission-specific authority never carries forward.
6. **Follow-ups do not occupy delivery lanes.** After draft publication, PR
   corrections use the repository's review-follow-up checkout while the stable
   lane reconciles for its next mission.
7. **Trusted-host threat model.** The local OS account, repository host, and
   installed toolchain are trusted. The rail protects against accidental drift,
   stale state, malformed inputs, unsafe links, ambiguous identity, and agent
   misuse; it does not attempt to defeat a malicious same-user process racing
   filesystem namespaces.
8. **Validation is portable; Nx is the V1 executor.** Contracts name targets,
   inputs, required evidence, and outcomes without embedding one tool's command
   syntax. The first adapter resolves them through focused and affected Nx
   targets with normal cache behavior. Direct test-runner commands are
   diagnostic exceptions, not the default validation path.
9. **Adapters preserve identity.** Codex, GitHub Copilot, Factory Droid, local
   model, and future hosts consume the same seat and task contracts while
   recording the actual executor and model.
10. **Compatibility stays outside the kernel.** Legacy behavior is evidence,
    not automatically a requirement. Preserve proven invariants and useful
    output vectors through adapters, but do not import legacy mission schemas,
    lifecycle assumptions, authority rules, or recovery machinery into the new
    kernel. Do not recreate recovery paths for failures eliminated by the new
    architecture.
11. **Maintainability is executable.** Every package has focused build, test,
    typecheck, lint, dependency-boundary, and code-quality targets from its
    first production change. Code-smell evidence is part of milestone
    completion. Vendor tools such as SonarQube integrate as adapters over that
    evidence rather than becoming kernel dependencies.
12. **Small is the default.** Components own one cohesive capability; modules
    expose narrow interfaces; functions perform one named transformation.
    Crossing the documented size/complexity thresholds requires a recorded
    split decision or explicit architectural exception.
13. **Governance enables velocity.** The default eligible transition advances
    automatically, and advisory evidence does not become a stop. The Rail
    blocks an unsafe or unauthorized effect, not the entire mission: known
    correctable failures classify, repair, validate, and rejoin through a
    deterministic switch. Discovery may expand work within the accepted outcome
    and risk envelope, including a bounded prerequisite branch when useful;
    changes to the promised outcome, material risk, or irreversible authority
    require recorded human direction.
14. **The Rail is reference-quality software.** V1 completion requires
    measurable evidence for architecture boundaries, focused tests, type
    safety, lint and code-smell thresholds, documentation, and an end-to-end
    proving trace. A successful prototype with hidden coupling, unexplained
    debt, or missing quality evidence is not V1.
15. **Humans can keep up.** Guided Review renders plans, exact code changes,
    and QA scenarios as small acceptance-criterion-aligned sections. Coulson
    can understand, question, revise, approve, or record an observed QA outcome
    without reading transcripts or raw protocol JSON. The view is a projection
    over canonical state, not a second workflow engine.

## Proposed package boundaries

Five boundary decisions are frozen before construction GO:

1. neutral review facts live in `@shield/review-contract`; Guided Review
   produces them and Mission Rail consumes them;
2. neutral manifests, packets, receipts, scopes, and effect envelopes live in
   `@shield/execution-contract`;
3. `@shield/event-store` supplies neutral durable-stream machinery while each
   domain owns its event payloads;
4. stable-lane readiness occurs after draft publication and is independent of
   mission delivery, which continues through review-follow-up QA;
5. `@shield/mission-host` is a small composition root over narrow adapters,
   never a replacement all-in-one team system.

```text
canonical-contract   -> []
review-contract      -> [canonical-contract]
execution-contract   -> [canonical-contract]
mission-rail         -> [canonical-contract, review-contract,
                         execution-contract]
guided-review        -> [canonical-contract, review-contract]
lane-lifecycle       -> [canonical-contract, execution-contract]
event-store          -> [canonical-contract]
mission-projection   -> [mission-rail, lane-lifecycle, review-contract,
                         execution-contract]
mission-host         -> [mission-rail, event-store, lane-lifecycle,
                         review-contract, execution-contract]
team-system          -> [mission-host, mission-projection,
                         mission-preparation (retained legacy), legacy adapters]
```

The arrows point from a package to its dependencies. `mission-rail` and
`lane-lifecycle` are pure.
`event-store` owns neutral durable-stream codecs and replay machinery but
performs no I/O; Rail, lane, and execution packages own their domain event
types. `mission-host` is a small composition root;
JSONL, Git, filesystem, publication, process, model, and signer capabilities
live behind narrow host adapters.

`mission-rail-quality` is a repository tooling/CI Nx project, not a runtime
package. It orchestrates graph checks, package surfaces, cache proof, quality
adapters, exact-revision resolution, and the proving flight without becoming a
dependency of production libraries.

### `@shield/canonical-contract`

Owns canonical JSON, deterministic digests, content IDs, closed-result helpers,
and primitive validators. Begin by surgically extracting the proven neutral
parts of `@shield/mission-preparation/canonical-json-v1.mts` with their tests.
No Git, filesystem, seat, mission-phase, or authority concepts are allowed.

### `@shield/review-contract`

Owns only the host-neutral review facts consumed by the Rail: review kind,
subject digest, exact revision, ordered decisions, deterministic aggregate,
operator identity, and evidence references. It contains no rendering,
filesystem, dispatch, authority, or mission-transition policy.

`@shield/guided-review` produces this contract; `@shield/mission-rail`
consumes it. This direction prevents the Rail from importing a UI-oriented
review package or creating a dependency cycle.

### `@shield/execution-contract`

Owns neutral manifests, task packets, owned-path and exclusion envelopes,
integration receipts, effect requests/results, and Epic Wheels Up scope. A
packet records the objective, exact base, dependencies, permitted effects,
validation envelope, and terminal handoff without naming Factory, Codex,
Copilot, GitHub, or a particular model.

It also owns the pure effect lifecycle and validates its ordering:

```text
unclaimed -> claimed -> succeeded | failed | uncertain
uncertain -> reconciliation_claimed
reconciliation_claimed -> reconciled_succeeded | reconciled_failed |
                          still_uncertain
still_uncertain -> reconciliation_claimed
```

`mission-host` performs the effect and submits observations; its persistence
adapter writes streams using `@shield/event-store` codecs and validation.
`@shield/event-store` performs no I/O. Neither package may invent or relax
effect transitions. Every reconciliation claim binds a fresh attempt ID;
`still_uncertain` can only request another observation and can never authorize
blind repetition of the original effect.

### `@shield/mission-rail`

Owns the pure mission model and transition function. It has no filesystem,
process, network, GitHub, signer, model, or clock access.

The minimum state model is:

```text
intake -> planning -> awaiting_plan_review
       -> awaiting_implementation_approval
       -> implementing -> validating -> conforming
       -> awaiting_code_review -> publishing -> awaiting_qa
       -> delivered
```

`cancelled` and `archived` are terminal dispositions. `blocked` describes the
current operation, not automatic death of the mission. Correctable failures
return a repair instruction; true novelty returns a bounded Hill/Fury judgment
junction with gathered evidence. A recorded repair or judgment produces a
deterministic successor. A transition never silently manufactures a new
mission to escape incompatible state.

Mission phase and lane state are related but not identical. After draft
publication, the lane may reconcile to `ready` while the mission continues in
`awaiting_qa` through a dedicated review-follow-up checkout.

The public `next` result is a closed union:

```text
automatic | human_gate | external_blocker | repair_required |
judgment_required | complete
```

Each result includes a stable reason code, concise human projection, required
inputs, permitted effect, and expected successor state.

`judgment_required` is a deterministic junction, not an open-ended agent chat.
V1 permits only four reason codes:

| Reason code | Accountable seat | Consulting seat |
| --- | --- | --- |
| `scope_boundary_unclear` | Hill | Fury |
| `delivery_topology_exception` | Hill | Fury |
| `architecture_contract_novelty` | Fury | Hill |
| `conformance_evidence_novelty` | Fury | Hill |

Each reason code has a closed decision-to-successor table in the manifest. The
request binds an exact subject digest, repository revision, accepted-event
watermark, evidence-packet digest, reason code, and canonical route-registry
digest. The judgment-request digest covers every binding and the selected
reason's decision-to-successor map. The recorded decision binds that request
digest, the selected decision, and expected successor. Replaying the same
judgment ID and digest is idempotent; stale bindings, duplicate IDs with
different digests, missing required consultation, unknown reason codes, or
decisions outside the closed set are conflicts and cannot advance the Rail.
Adding a V1 reason code is an architecture change, not ordinary runtime
configuration.

Entry into `awaiting_implementation_approval` requires a Fury PASS bound to the
exact plan digest and repository base/tree. Human approval binds that reviewed
plan, owned paths, permitted implementation and draft-publication effects, and
explicit merge/deploy/release/destructive exclusions. A plan change invalidates
the review and approval; an implementation-head change invalidates only
revision-bound validation and conformance evidence.

Publication requires an approved Guided Code Review bound to the exact
candidate revision. Draft publication transfers follow-up ownership to a
dedicated review checkout and allows the stable delivery lane to reconcile and
return to `ready`. The mission remains active until Guided QA and the final
publication disposition bind the exact candidate. A changed candidate
invalidates code-review and QA outcomes without invalidating the accepted epic
or plan.

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

The library produces the typed decisions defined by `@shield/review-contract`
and deterministic aggregate
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
versioned JSON contract for all three review kinds. The HTML experience follows
the proven Document Trail pattern: one prepared link, curated source passages,
small learning/review steps, PASS or exact replacement decisions, autosaved
progress, and a changes-only completion packet. Closing the browser loses no
canonical state, and no UI event can grant authority by itself.

### `@shield/event-store`

Owns neutral closed event envelopes, typed-stream registration, snapshots,
deterministic replay, optimistic sequence checks, and evidence references. It
stores and replays facts; it does not know mission phases, lane states, seats,
or effects, does not decide the next action, and performs no I/O. Rail, lane,
and execution packages own their event payload codecs. The first host adapter
may persist typed streams as repository-local JSONL and canonical JSON. No
database is required for V1.

Evidence supports delivery; it is not the end goal. Missing, stale, duplicated,
or conflicting evidence routes to correction whenever it can be repaired
safely. The Rail stops only when the conflict could cause an unsafe or
unauthorized effect or cannot be resolved without external capability or
bounded judgment.

The minimum neutral envelope contains stream ID and type, schema version,
contiguous sequence, predecessor digest, event ID, canonical event digest,
payload type, and canonical payload. Mission identity, repository tuples,
accountable seats, runtime attribution, lane state, and effect identity live in
closed domain payloads rather than in every storage primitive.

Replay treats the same ID and digest as an idempotent duplicate and the same ID
with a different digest as a conflict. It rejects sequence gaps, unknown
versions, incorrect predecessor watermarks, and snapshot/log terminal
sequence-or-digest disagreement. Domain packages validate payload-specific
ordering and identity before a fact is accepted.

### `@shield/lane-lifecycle`

Owns configured persistent delivery lanes and ephemeral worktrees:

```text
ready -> assigned -> active -> published -> reconciling -> ready
```

Required operations are `prepare`, `assign`, `status`, `reconcile`, `retire`,
`doctor`, `prepare-follow-up`, `status-follow-up`, and `retire-follow-up`.

The pure review-follow-up lifecycle is:

```text
absent -> prepared -> active -> qa_complete -> retired
                       active -> archived -> retired
                  qa_complete -> active
```

`prepared` binds the publication identity, exact candidate, source lane, and
repository. An exact-candidate correction records an `active -> active`
transition, or `qa_complete -> active` after completed QA, with a new candidate
identity; either correction invalidates only the prior candidate's review and
QA facts. Normal retirement requires `qa_complete` plus
a merged or otherwise completed publication disposition. Explicit archival may
retire an abandoned follow-up without implying QA completion or mission
delivery. Publication alone is never sufficient. Replaying the same lifecycle
event ID and digest is idempotent; a changed digest, stale candidate, invalid
transition, dirty checkout, or unique unpublished commit rejects without
mutation.

- `reconcile` preserves each configured lane's filesystem home, proves the
  previous work is published or intentionally archived, transfers PR and QA
  ownership to the review-follow-up checkout, clears mission-local state, moves
  to the selected exact base, installs current policy, verifies dependencies,
  toolchain, build, run, and QA readiness, and emits a fresh receipt.
- trusted-host and signer enrollment persist across assignments;
  mission-specific authority and evidence never carry forward;
- `retire` removes only clean ephemeral worktrees whose commits are merged or
  explicitly archived.
- neither operation deletes dirty or uniquely committed work;
- changing a clean durable lane's branch is an ordinary supported lifecycle
  transition, not an exceptional recovery protocol.

### `@shield/mission-host`

Owns effect composition and observations through small ports. Host core maps a
Rail operation to one adapter call and one durable result; separate adapters
own Git, filesystem, publication provider, issue provider, agent dispatch,
model/runtime identity, signing, clocks, validation executor, and process
execution. No adapter may add workflow policy. Host failures do not change pure
state until a durable result is recorded.

Every external effect has a deterministic idempotency key and durable
`claimed | succeeded | failed | uncertain` record. Retry first observes the
existing result and never repeats a succeeded or uncertain effect blindly.

Execution observations bind observation ID and digest, subject, repository
tuple, accepted-event watermark, predecessor observation, monotonic ordinal,
host-observed time, and repository relation: `same | descendant | diverged |
unknown`. An uncertain effect advances only through a fresh reconciliation
claim bound to effect and attempt IDs. Its observation records
`reconciled_succeeded | reconciled_failed | still_uncertain`; it is never
blindly repeated.

### `@shield/mission-projection`

Owns the pure read model consumed by terminal status, CLI, and Mission Control.
It converts validated domain projections produced by domain-owned replay and
projector functions into stable views:
mission phase, lane state, exact revision, active seat/run, blocker class,
human gate, validation state, publication state, and one recommended action.
It cannot write journals, grant authority, dispatch agents, or perform effects.

`mission-projection` consumes already validated domain state from Mission Rail,
lane lifecycle, review contract, and execution contract. It never imports
`@shield/event-store`, decodes raw generic event envelopes, or decides whether
replay is valid. The host composition boundary replays and validates domain
facts before projection. Mission Control and the CLI read the projection and
submit neutral commands through the host command port; they never mutate state
directly. Guided Review renders its own review contract and submits typed review
facts through that neutral port; neither the Rail nor Host imports the Guided
Review UI package. UI loss therefore cannot lose canonical mission state.

“Mission” is SHIELD domain vocabulary in these contracts. Capitalized Factory
Mission and Mission Mode names appear only in the Factory adapter/bootstrap.

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
cached validation targets, route seat reviews, push branches, and open draft
review publications. They stop only for:

- a material architecture or scope change;
- a meaningful human authorization or acceptance decision;
- missing credentials or external capability;
- contradictory evidence that software cannot resolve deterministically;
- destructive, merge, deployment, or release effects not explicitly granted.

For Track-Layer construction, this is **Epic Wheels Up**: one human GO binds the
accepted architecture and manifest feature/dependency graph, owned-path union,
quality milestones, execution host, autonomy level, effect envelope,
budget/expiry, material-risk envelope, and explicit exclusions.
Within that envelope Hill may cycle crews through indexed delivery issues, corrections,
validation, and draft PR publication without a new PIN or planning ceremony per
issue. Adding an indexed issue is automatic only when it represents an existing
manifest feature or a bounded correction inside the accepted envelope. A change
to any GO-bound product outcome, graph, path, milestone, host/autonomy,
budget/expiry, architecture/manifest binding, material risk, or effect requires
a recorded amendment; excluded merge, deployment, release, and destructive
effects require separate authority.

Ordinary Delivery Mode keeps lightweight Guided Plan, Code, and QA review per
issue. Track-Layer Mode reviews the epic architecture and envelope before GO,
then uses milestone review and one complete Guided Code Review and Guided QA at
epic completion. A material divergence triggers review when discovered; routine
issue boundaries do not repeatedly stop the construction train.

Execution evidence keeps responsibility and execution separate. Every dispatch,
review, validation, and completion record includes `accountableSeatId`, host
kind, reasoning runtime ID, model ID, tool-executor ID, and neutral
mission/feature/run identity. A Droid, agent, or generated nickname is display
metadata only. Mack independence requires a distinct run identity and no
implementation write set.

## Construction-host program

A supported execution host receives the architecture and manifest feature graph as a
bounded execution plan rather than a single open-ended rewrite prompt. Factory is the
first host used to prove this construction packet; Factory, Codex, Copilot,
local models, and future runtimes remain adapters over the same contracts.

### SHIELD and Factory are complementary

Factory supplies an execution environment: persistent Missions, Droids,
repository tools, parallel work, validation surfaces, and host-managed context.
SHIELD supplies the operating model: portable seat responsibilities, accepted
scope, deterministic next operations, meaningful human gates, exact review and
evidence contracts, delivery disposition, and recovery semantics.

SHIELD must not wrap or reproduce Factory capabilities merely to rename them.
The Factory adapter translates one neutral SHIELD task packet into Factory
configuration and records the real host, Droid, model, tool executor, and run
identity in its result. Factory remains free to improve its mechanics without
changing the meaning of a SHIELD mission, and another host can execute the same
packet without pretending to be Factory.

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
4. Human GO approves the selected host's bounded execution plan and autonomy
   level.
5. Record Epic Wheels Up with the accepted feature graph, owned-path union,
   milestones, effect envelope, budget/expiry, and exclusions.
6. Execute in the selected host's bounded autonomous mode. Use the highest
   autonomy permitted by organization policy only after the bounded plan is
   accepted. Continue through every in-envelope feature and correction without
   asking for per-issue GO. The Factory adapter renders this as Mission Mode.

### Mission milestones

Execution-host work units map one-to-one to manifest feature IDs and their
generated delivery issues. In Factory, each work unit is a Feature. The
manifest is the sole accepted dependency graph; issue-provider records are
indexed delivery views and cannot silently alter it. Validation happens at
three integration milestones rather than after every tiny baton pass:

| Milestone | Features | Required validation |
| --- | --- | --- |
| Foundation | quality harness, canonical/review/execution contracts, mission rail, Guided Review | focused package builds/tests, property and mutation targets, graph boundary, cache proof, quality-adapter gate, Fury architecture check |
| Lifecycle | event store, mission-host scaffold, persistent lane lifecycle, Mission Control projection | focused package builds/tests, property and mutation targets, package surface, filesystem-backed lane rehearsal, Mack exact-revision validation |
| Vertical flight | host composition, thin CLI, ordinary proving issue, separate Track-Layer construction proof | affected build/test with cache, ordinary end-to-end flight, construction-trace validation, Mack validation, Fury conformance |

Parallel work is allowed only for features with disjoint owned paths and no
unsettled contract dependency. A worker that needs an upstream contract waits
for the milestone artifact instead of inventing a private shape.

The declared dependency chain intentionally serializes the few shared package
metadata edits. MR-035 creates `packages/mission-host/package.json`; MR-040 may
change only its lane-lifecycle dependency/export entries; later adapter work
uses disjoint source subpaths. Shared metadata is never treated as parallel
ownership.

### Executable issue packet

Every issue contains these headings:

```text
Outcome
Architecture source and exact base
Depends on
Owned paths
Inputs and reusable legacy sources
Required behavior
Explicit exclusions
Execution-host notes
Nx validation commands
Required artifacts
Terminal handoff
```

`Execution-host notes` name the preferred runtime, feature or milestone, safe
autonomy envelope, allowed parallelism, and specialist handoffs. Host-specific
settings are operational advice, not product contracts; the packet must remain
executable by another supported host.

Every feature starts from an exact integration commit/tree containing all
accepted dependencies. The parent integration actor records one accepted
integration receipt per integrated feature after that feature's declared
validation passes against the integrated candidate tree, and adds milestone
validation when a milestone boundary is reached. It then regenerates downstream
packet identities. Base/tree mismatch fails closed. Mechanical advancement
remains inside GO only when feature scope, owned paths, effects, and dependency
edges are unchanged. A `milestone` handoff records the feature where execution
resumes and creates no dependency edge. Operational detail lives in
`docs/architecture/mission-rail-v1-construction-spec.md`.

Epic Wheels Up emits the genesis `shield.integration-receipt.v1`, bound to the GO,
architecture revision, and manifest digest; its candidate tree is the accepted
architecture tree and it supplies MR-000's exact base. Every later feature uses
the terminal accepted integration receipt. Revision resolution is non-cacheable
and writes a locally ignored content-addressed input keyed by receipt and HEAD
digests. Every consuming target revalidates those bindings before work, so
successive bases cannot overwrite or accidentally reuse one another.

`shield.execution-feature-packet.v1` is the closed machine contract behind the
human issue headings. It requires the fields shown above plus issue/feature ID,
exact-base derivation, allowed and excluded effects, execution-host advice,
required artifacts, and typed handoff; unknown or missing fields reject.

`shield.integration-receipt.v1` requires receipt ID, program ID, feature ID,
base tree, candidate tree, predecessor receipt digest, packet digest, manifest
digest, changed-path digest, milestone-validation references, accountable host
identity, disposition, and recorded time. The canonical receipt digest covers
the complete record.

`shield.track-layer-amendment.v1` requires amendment ID, prior GO digest,
trigger reason, exact repository revision, requested scope/path/effect delta,
updated envelope digest, accountable human identity, decision, and recorded
time. An accepted amendment creates a new GO lineage point; issue comments and
chat cannot widen the envelope. The successor GO binds both the prior GO digest
and accepted-amendment digest; those fields are null only for genesis.

## Executor portability

Repository task packets are the source of truth. They contain objective,
owned paths, exact base, inputs, exclusions, expected outputs, validation
targets, and terminal handoff. They do not depend on chat history.

This shape supports:

- Codex named agents backed by `.codex/agents/`;
- GitHub Copilot repository agents backed by `.github/agents/`;
- Factory project Droids backed by `.factory/droids/`;
- local-model adapters for eligible seats.

Factory is the first construction and proving host because custom Droids
provide isolated context, per-role model/tool policy, repository-local
definitions, CLI/headless execution, MCP context, and persistent Missions and
automations. This is bootstrap guidance, not a product contract. Each host maps
the same seat and task contracts into its own runtime; the Mission Rail never
imports host-specific APIs.

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
  resolution, packet verification, graph boundary, affected validation, cache
  proof, lane rehearsal, package surfaces, repository-owned quality scan/gate,
  optional quality adapters, and the ordinary proving flight plus the separate
  construction-program proof.
- Add the minimal Factory project-Droid and Mission bootstrap material needed
  to execute the remaining flights from repository context.

### Flight 1 — canonical contract extraction

- Generate `@shield/canonical-contract` through the repository Nx generator.
- Extract neutral canonicalization and identity behavior with tests.
- Leave `@shield/mission-preparation` exports, dependencies, tarball, and
  offline-install behavior unchanged through Flight 6. Extract from its pinned
  source commit; do not redirect the legacy package to the new library yet.

### Flight 2 — pure review and execution contracts

- Implement `@shield/review-contract` and `@shield/execution-contract` before
  either the Rail or Guided Review chooses private shapes.
- Freeze neutral review facts, task packets, effect envelopes, integration
  receipts, owned paths, exclusions, and Epic Wheels Up scope.

### Flight 3 — pure mission rail

- Implement the minimal mission state, events, `next` union, and table-driven
  happy-path tests.
- Implement Guided Review plan/code/QA behavior and static adapters against the
  frozen review contract.
- Prove no host imports, deterministic transitions, exact review binding, and
  property/mutation coverage of the critical state kernel.

### Flight 4 — store, lane lifecycle, and minimum host adapters

- Implement closed event/observation codecs and deterministic replay.
- Scaffold `@shield/mission-host` and freeze its typed ports before any adapter
  feature writes a subpath.
- Implement persistent-lane
  assignment/reconciliation, and ephemeral retirement.
- Implement only the Git/filesystem adapters required for a real disposable
  lane rehearsal.
- Prove clean branch reassignment as required V1 behavior; do not recreate
  `predecessor_branch_mismatch` as a new-kernel recovery protocol.

### Flight 5 — projection and broader host composition

- Persist rail events and observations through the host adapter.
- Implement the pure Mission Control projection plus GitHub, process,
  dispatch, and human-gate adapters.
- Derive all machine packets; callers supply decisions, not internal JSON.

### Flight 6 — thin CLI and first proving issue

- Expose `mission begin`, `mission next`, `mission status`, and lane commands.
- Carry one curated real issue through the complete path.
- Verify the draft PR exists and the stable lane returns to `ready`.
- Launch the exact candidate against a disposable but real proving environment.
- Demonstrate at least one visible operator journey from issue intake through
  the delivered behavior; retain a concise transcript, screenshots or video,
  expected/observed results, and exact revision binding.
- Record elapsed time, human interruptions, cache results, and every repair edge.

### Flight 7 — construction-program proof

- Validate the Epic Wheels Up record, accepted feature graph, milestone
  receipts, bounded corrections, effect envelope, and execution-host identities
  independently of the ordinary issue flight.
- Prove that the construction program advanced through accepted features and
  draft publications without per-issue GO, while every material amendment and
  excluded effect remained visible.
- Retain this Track-Layer trace separately from the product-flight trace.

Only after Flights 6 and 7 pass independently may existing commands be
redirected or legacy code removed.

## Ordinary delivery proving-flight acceptance

- A cold Hill can begin a named issue without composing JSON.
- The system always identifies the current phase and one legal next action.
- Plan and implementation reviews bind to exact revisions.
- One meaningful implementation approval authorizes the bounded work.
- May and Mack use focused or affected Nx targets with cache enabled.
- Draft PR publication requires no redundant PIN after bounded implementation
  publication was approved.
- No successful mission ends with unique commits only in a local lane.
- Configured stable lanes can accept another mission without changing paths or
  deleting installed dependencies, and their build/run/QA readiness is proven.
- The same task packet can be executed by a Codex seat or Factory Droid while
  preserving actual runtime identity.
- Guided QA visibly demonstrates the exact candidate working in a real proving
  scenario. A checklist, mocked unit test, or prose claim alone cannot PASS.
- QA evidence records setup, action, expected result, observed result, retained
  artifact references, operator disposition, and exact candidate revision.
- Legacy SHIELD remains runnable until an explicitly reviewed migration removes
  it.

## Track-Layer construction-program acceptance

- One Epic Wheels Up binds the accepted feature graph, owned-path union,
  milestones, effect envelope, execution host, budget/expiry, and exclusions.
- Every feature and bounded correction derives from that envelope without a
  per-issue PIN; material outcome, risk, path, or effect expansion records an
  amendment instead of silently widening authority.
- Integration receipts form one contiguous exact-revision chain from genesis
  through the final construction candidate.
- Milestone Mack and Fury results bind their exact integrated revisions.
- Every draft publication, interruption, repair edge, judgment junction, and
  human amendment remains visible in the construction trace.
- Passing or failing this construction-program proof does not alter the result
  of the ordinary product proving flight.

## Explicit non-goals

- Reproducing every schema-9 transition before the first flight.
- Preserving every historical journal or temporary-worktree recovery path.
- Defending against malicious same-user namespace races.
- Hosting Mission Control, mobile PIN entry, deployment, or release.
- Automatically merging pull requests.
- Building a general workflow engine or adopting a database in V1.

## GO gate

GO is Epic Wheels Up. It means this document, the manifest's dependency-ordered
feature graph, its indexed delivery issues, and the selected host's rendered
bounded execution plan are accepted. It
authorizes autonomous Track-Layer construction through draft review
publications under each issue's owned paths and acceptance criteria, using the
selected host autonomy level within organization policy. It does not authorize
merge, deployment, release, destructive migration, or deletion of the existing
SHIELD runtime.

The recorded GO identity contains the architecture Git revision, architecture
file digest, machine-readable feature-manifest digest, rendered execution plan
digest, accepted feature IDs, owned-path union, milestones, allowed and
excluded effects, budget/expiry, selected host and autonomy level, accountable
human identity, and timestamp.
