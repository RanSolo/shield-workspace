# Issue #268 — key-turn governance evidence parent plan

## Frozen identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `fc47ccf5b47fc1b340d1ec80a5c025ac7fd04344`
- Parent issue: `#268`
- Related: `#96`, `#161`, `#196`, `#203`, `#236`, `#240`, `#251`
- Authority: planning and read-only reconnaissance only
- Human authority remains with Coulson, Fitz, and Simmons.

## Objective

Make governed local-agent orchestration produce a net savings in hosted Hill
reasoning. Deterministic software must compile the evidence, packets, checks,
and next action that Hill currently reconstructs manually. Routine success
should pass through Hill without repository rediscovery or action-payload
repair; only scope decisions, genuine ambiguity, and human gates should require
Hill reasoning.

The operator consequence should still feel like a key turning a lock:

1. Hill freezes the small set of planning decisions that cannot be observed.
2. Mission Builder compiles those exact Fury-reviewed decisions once.
3. Hill invokes one stable command with a mission ID and reviewed-intent
   reference; Hill does not select a transition command, author action JSON,
   sort paths, reconstruct bindings, or interpret raw journal output.
4. Deterministic software derives every live repository, journal, signer,
   revision, path, effect, runtime, and gate fact.
5. The complete transition is preflighted before a passcode prompt.
6. Coulson sees only the exact decision, exclusions, remaining human gates,
   and PIN/cancel action.
7. A successful PIN performs exactly one existing authorized transition and
   returns to an empty shell prompt.

The primary efficiency outcome is turnkey operation for Hill and decisive local
packets whose value exceeds their hosted orchestration/review cost. The current
CLI is already usable; concise human output is a secondary boundary and must be
preserved or minimally corrected rather than redesigned for its own sake.

This parent plan also makes local Daisy, May, and Mack practical under bounded
context by compiling decisive packets and allowing governed Mack validation to
aggregate multiple exact-bound model assessments without confusing them with
host command evidence or authority.

## Dogfood baseline

Issue #259 required Hill to construct or repair action-specific JSON, canonical
path lists, publication input, commands, review packets, and human summaries.
The final local Qwen3 Coder Next Mack review worked when split:

- packet 1: 13,769 input tokens, 786 output tokens, about 26 seconds;
- packet 2: 22,475 input tokens, 819 output tokens, about 30 seconds.

The current governed Mack runner instead places the complete diff and every
implementation source in one prompt. For #259 that was roughly 580 KB before
base64/JSON expansion and could not fit the selected 36k context. It has no
contract for multiple packet assessments or a host-derived aggregate result.

The #268 planning flight then pre-staged three local packets and ran them
sequentially from one clean worktree. The CLI lane found useful interfaces at
15,173 input tokens. The packet-compiler lane mostly mirrored existing types
and did not close aggregation. The validation lane invented a nonexistent
command and placeholder proofs. These latter outputs are retained outside the
repository as benchmark evidence and are not treated as repository facts.

## Architecture boundary

### Nx project boundary

Create a focused `@shield/mission-preparation` Nx library for authority-none,
deterministic orchestration inputs and projections. It owns reviewed intent,
selection, candidate compilation, preflight evidence, and stable reason codes.
It has no signer, journal mutation, GitHub, model invocation, or human-authority
capability. `@shield/team-system` remains the effectful host/CLI adapter and
invokes existing signing and atomic-append behavior.

The dependency direction is from the host adapter to the preparation library;
the preparation library has no dependency on any `@shield/team-system` subpath
and does not import CLI, receipt replay, or effectful host code. Focused
library tests are the fast iteration loop. Nx affected validation still runs
downstream consumers before exact-revision acceptance, so the boundary reduces
development churn without hiding impact.

### The key is a reviewed plan intent, not inferred authority

Repository and journal observations cannot determine planning decisions such
as approved implementation paths, effects, capabilities, validation lanes, or
runtime choice. `prepare-next` must not infer those decisions from an issue,
model prose, changed files, notebook memory, or repository heuristics.

Define one closed, content-addressed `mission.transition-intent.v1` produced by
Mission Builder as the sole production compiler from an exact Fury-reviewed
plan. Helicarrier V0 remains experimental and does not own this path. The
compiler input binds the exact repository and planning base, plan commit,
repository-relative plan path, raw-byte SHA-256, additive parent-plan Fury
review-evidence digest/PASS verdict, and compiler contract/version. The existing
implementation-blueprint Fury evidence is not treated as if it covered this
parent plan. Missing, stale, conflicting, or revision-mismatched plan/review
evidence prevents intent production.

Non-observable decisions are frozen in a separate closed
`mission.transition-plan.v1` artifact generated through Mission Builder's typed
planning input. It is not extracted from Markdown. Its digest is covered by
`mission.parent-plan-review-evidence.v1`, which binds repository, planning base,
plan commit/path/raw digest, transition-plan digest, PASS verdict, Fury seat,
actual review runtime/model/executor, and exact Fury dispatch-receipt identity.
The parent review evidence is authority-none and cannot substitute for Coulson
authorization.

The preparation library validates the closed review envelope, identities, and
digests but does not claim that raw Fury receipts establish production
attribution. Synthetic projections are useful for pure tests and are always
production-ineligible. In A1, the Team System host remains the sole raw-receipt
verifier and uses the existing `evaluateSeatDispatchAttributionV1` path to
derive the closed attribution projection. Mission Builder compilation and host
materialization require that verified projection, bound to the raw receipt-set
digest, exact plan/transition-plan identities, and reviewer
runtime/model/executor.

The intent is a closed discriminated union by transition kind and contains only
the decisions that cannot be observed:

- mission and reviewed-plan identity;
- transition family and bounded desired outcome;
- approved implementation/publication paths;
- approved action, effect, capability, and validation IDs;
- selected model, runtime, and executor identities where applicable;
- explicit exclusions;
- packet/validation campaign declarations where applicable.

Adapter-fixed facts—including the May seat, initial-draft effects, and
intrinsic exclusions—are derived by the adapter and cannot be caller-selected.
The intent grants no authority. Its exact digest binds the prepared candidate,
manifest, machine evidence, and authority-none preparation receipt. Lane A0
does not add it or reviewed-plan identity to the four existing signed authority
payloads or journal entries. Current repository, branch,
HEAD, base ancestry, path kinds, journal sequence/state, signer binding,
authority identities, timestamps, runtime observation, and remaining gates are
always host-derived.

### One dispatcher, existing transition meanings

Expose one thin canonical orchestration command:

```text
shield mission prepare-next \
  --mission-id mission:issue-N \
  --root .
```

Hill does not locate or transport an intent file. After exact Fury PASS, a
bounded host materialization operation validates the transition plan and review
evidence, writes the content-addressed intent to a protected external store
using no-follow identity-checked bounded I/O, and records the mission-to-intent
reference. `prepare-next` resolves that exact reference itself. Materialization
is authority-none, requires no Hill-authored mechanical field, and fails on
forged, stale, cross-plan, replaced, ambiguous, or conflicting evidence.
Intent resolution replays or revalidates the protected raw-receipt attribution
before use; injected or caller-asserted projections cannot become
production-eligible.

This is a host facade over the preparation library, not the primary product or
a replacement command language. Interactive mode prepares, preflights, and
renders the exact next eligible
transition, then prompts once. `--prepare-only --json` is an explicit
preparation-only machine mode: it does not read stdin, invoke a signer, append
to a journal, contact GitHub, or invoke a model. Existing
`authorize-wheels-up --json` behavior is unchanged.

The dispatcher uses a literal transition-kind registry and an exhaustive
`(intent variant, replayed projection state) -> adapter or stable reason` table.
There are no dynamic command names, function references, action-to-command
lookups, fallback adapters, or model-selected transitions. Adapter-fixed facts
override or reject conflicting intent data.

Transition-specific adapters reuse the existing
validators, preparation functions, signers, stores, and replay checks. It does
not introduce a new authority class or reinterpret:

- mission authorization;
- `authorize-wheels-up`;
- Daisy/May runtime binding;
- `review.publish`;
- ready-for-review, merge, deployment, release, or final acceptance.

The first implementation slice supports the fresh schema-9
`authorize-wheels-up` transition because it already composes governance,
implementation authority, runtime binding, and initial draft-publication
authority behind one passcode. Later slices add current-state publication-only
and supported binding transitions through the same dispatcher contract.

### Preparation and freshness

Preparation returns a closed candidate containing:

- intent digest and exact reviewed-plan identity;
- selected existing transition kind;
- exact derived action-specific input;
- complete repository/journal/signer observation digest;
- exact human decision projection;
- machine evidence reference;
- stable reason code or ready state.

The preparation receipt is authority-none and content-addressed. It proves the
intent/plan binding and exact preflight observations without changing existing
signed journal semantics.

No temporary action-specific JSON is required from the operator. Preparation
may use protected external temporary artifacts, but they are authority-none,
credential-free, create-only, and safely disposable.

After PIN entry and before signing/append, the existing transition path repeats
its full freshness observation. Snapshot reuse may reduce duplicate reads only
where the current contract can prove retained identity; it must not weaken the
post-passcode drift check.

## Sequential implementation lanes

All child briefs, expected writable paths, validation commands, and stop
conditions are frozen in one parent setup operation. Dependent worktrees are
not created from the planning base. Each child starts from the exact accepted
predecessor revision, installs dependencies once, and ends with exact-head Mack
validation and Fury conformance before the next child begins.

B1, B2, every seat-specific C integration, and D remain implementation-blocked
until an exact predecessor-bound child plan freezes writable and forbidden
paths, validation commands, tests, public/internal API impact, compatibility
vectors, and migration consumers and receives its own Fury plan PASS. This is
followed—not replaced—by exact-head Mack validation and Fury conformance.

### Lane A0 — preparation-library vertical slice

Create `@shield/mission-preparation` and deliver the reviewed-intent contract,
pure next-transition selector, fresh schema-9 `authorize-wheels-up` candidate
compiler, `mission.transition-plan.v1`, parent-plan review evidence validation,
concise decision projection, and authority-none preparation receipt.
This slice proves the library boundary with no signer, journal mutation, CLI
prompt, GitHub operation, model invocation, Team System import, raw-receipt
replay, or production-attribution assertion.

### Lane A1 — existing CLI/effect-path integration

Connect the accepted Lane A0 candidate to the canonical `prepare-next` facade
and the existing `authorize-wheels-up` effect path. Add the bounded protected
intent materialization/resolution host operation so Hill supplies only mission
ID and root. The Team System host verifies raw Fury receipts with the existing
attribution evaluator before Mission Builder compilation and revalidates them
on intent resolution. Reuse:

- `validateAuthorizeWheelsUpInput` semantics;
- `prepareAuthorizeWheelsUp`;
- `signPayloadBatchWithSigner`;
- `appendProfileAwareMissionEntriesAtomicV1`;
- canonical publication-path ordering.

Do not replace the intended distinction between ordinary sorted identifiers
and canonical publication paths. Do not collapse pre- and post-passcode
freshness into one stale snapshot.

Lane A1 is complete when a fresh mission can be prepared and authorized without
hand-authored action JSON, intent-file transport, or a mechanical repair loop,
and with exactly one human decision prompt. Forged, stale, replaced,
cross-plan, missing, duplicate, and conflicting parent-review/materialization
evidence must fail before PIN or mutation.
Tests must also prove an acyclic Nx graph, absence of a duplicate attribution
evaluator, forged projection rejection, raw-receipt substitution rejection,
and reviewer runtime/model/executor mismatch rejection.

Minimally extend human rendering only where needed to show the exact mission, revision,
repository, branch, HEAD, paths, action/effect/capability/validation IDs,
selected model/runtime/executor, exclusions, and remaining gates. Preserve
`renderAuthorizeWheelsUpHumanV1` and its snapshots unchanged. Keep preparation
inside `mission-cli.mts`, or extract its private helpers once and route both old
and new commands through the same implementation with fixed-vector tests.

Lane A0 writable paths are limited to the new library and workspace metadata:

| Path | Purpose |
| --- | --- |
| `packages/mission-preparation/package.json` | Nx/npm project and focused targets |
| `packages/mission-preparation/tsconfig.build.json` | Isolated build boundary |
| `packages/mission-preparation/src/**` | Authority-none contracts and compiler |
| `packages/mission-preparation/tests/**` | Focused contract/adversarial tests |
| `package-lock.json` | Workspace membership lock update |

Lane A1 writable paths are limited to the accepted library dependency and host
adapter integration:

| Path | Purpose |
| --- | --- |
| `packages/shield-team-system/package.json` | Exact library dependency |
| `packages/shield-team-system/src/mission-builder-v1.mts` | Sole production compiler invocation |
| `packages/shield-team-system/src/mission-cli.mts` | Existing host/effect-path integration |
| `packages/shield-team-system/src/mission-human-output-v1.mts` | Minimal additive decision fields if required |
| `packages/shield-team-system/tests/supervised-cli.test.mjs` | Spawned CLI, freshness, and compatibility vectors |
| `packages/shield-team-system/tests/mission-human-output.test.mjs` | Exact decision snapshots |
| `package-lock.json` | Exact dependency lock update |

Package exports remain unchanged unless the child review proves a new public
contract is required. Legacy direct-command and output vectors must pass.

### Lane B1 — publication-only adapter

Add publication-only preparation through the same intent/dispatcher boundary.
The adapter produces the exact input already accepted by the existing command
and invokes the existing authority path.

### Lane B2 — runtime-binding adapter

After B1 is accepted, add runtime-binding preparation through the same closed
boundary. Reviewed selected runtime/model/executor identities remain distinct
from host-observed loaded-instance facts.

Do not add a generic dynamic command interpreter. Unsupported or ambiguous
mission states return one stable reason and no PIN prompt or mutation.

### Lane C — bounded local packet compiler child issue

Add a host-neutral packet contract/compiler, then integrate one seat per
accepted child slice. Input is
a closed packet intent containing exact mission/repository/revision/seat,
requested output contract, ordered evidence references, selected runtime/model,
context ceiling, reserved output/reasoning allowance, and stop conditions.

The compiler:

- captures each referenced artifact once and binds exact bytes/digests;
- separates system prompt, SHIELD context, evidence, and output contract;
- reports estimated/observed provider tokens and byte counts;
- refuses dispatch when the configured safe budget cannot fit;
- never retrieves hidden chain-of-thought or grants tools/authority;
- emits one content-addressed packet artifact and dispatch candidate.

For LM Studio, the host applies the exact loaded instance's prompt template,
counts the final rendered conversation—including system prompt and output
contract—with that instance's tokenizer, and compares the count to its observed
context length. The packet binds loaded-instance ID, model key,
tokenizer/template identity, context length, counter method, input count,
maximum generated-token reservation, hidden-reasoning reservation, safety
margin, and safe ceiling. If the endpoint cannot prove whether an output cap
includes hidden reasoning, reserve both or refuse dispatch.

A fallback estimator may only come from a host-owned, versioned registry proven
conservative for the exact model/template/tokenizer. Packet-declared estimators
are rejected. Model-reported counters remain post-dispatch observations.

### Lane D — governed multi-packet Mack campaign child issue

Extend local Mack additively with a campaign contract rather than weakening the
existing single-packet request. One campaign separates immutable
`campaignRequestId` and request digest from the final evidence digest and binds:

- exact mission, subject, repository, base, artifact HEAD, and changed paths;
- one host-executed ordered validation-lane receipt set;
- ordered packet specifications partitioning scenarios/evidence;
- exact runtime/model/executor identity and campaign context budget;
- complete required-scenario coverage and packet-result cardinality;
- each packet request, prompt, response, and assessment digest;
- host-owned finite maxima for packet count, scenario count, evidence-reference
  count, captured bytes, per-packet input/output/reasoning tokens, cumulative
  reserved tokens, inference count, and campaign wall time;
- one stable request ID, request digest, and final evidence digest.

The existing trusted command registry remains the sole executable-command
source. Packet/model content cannot supply command authority. The campaign
store uses an external canonical private root, no-follow access, owner/mode/link
checks, locking, create-only claims, ordered started/completed records, fsync,
exact readback, orphan handling, and conflict rejection. Git/runtime identity
is captured before and after commands, around every packet, and at aggregation.
V1 requires one exact loaded-instance/model/runtime/executor identity throughout.
Every packet must satisfy its loaded-context inequality, and the sum of all
exact packet inputs plus maximum output/reasoning reservations must fit the
cumulative campaign budget before the first inference. Zero, unbounded,
overflowed, or packet-supplied ceilings are rejected.

Host commands execute once for the campaign. If a command or inference may have
started but durable completion is absent, return `recovery_required`; never
rerun automatically. Model packets may only assess
their assigned evidence. The aggregate report is derived by the host:

- every required host lane must pass;
- every required scenario must have exactly one assessment owner; combination
  rules are deferred from V1;
- failed/uncertain assessments veto coverage;
- missing, duplicate, stale, cross-runtime, cross-revision, reordered, or
  conflicting packet evidence fails closed;
- model `advance`/PASS prose cannot create eligibility;
- replay returns the exact durable campaign record and performs no second host
  command or model invocation.

Define an additive campaign contract/reader and deterministic host projection
into unchanged `mack.validation.v0`, identifying every accepting consumer. The
existing `mack.local-validation.v1`, replay registry, and one-packet contract
remain valid and unchanged.

### Lane E — authority-none before/after proving issue

Before A0 implementation, freeze a content-addressed #259 baseline manifest
containing exact source transcript/receipt references, counter provenance,
lifecycle start/end boundaries, hosted Hill input/output tokens and turns,
manual structured-field edits, retries, local packet counters, and independent
acceptance result. Replay the same frozen orchestration scenario, or a matched
scenario whose equivalence is mechanically proven; an arbitrary fresh mission
is not comparable.

Run the key-turn path and compare it with that baseline.
Record authority-none metrics from host/provider sources:

- Hill-authored structured fields;
- manual commands and retries;
- pre-PIN preflight failures;
- human decisions and PIN prompts;
- Hill tokens;
- Hill tokens attributable specifically to payload construction, context
  repackaging, preflight repair, polling, and result normalization;
- local packet input/output/reasoning tokens;
- accepted local findings versus discarded/retried packets;
- repeated repository/context reads;
- elapsed time;
- handoffs and repair cycles.

The target is not zero human intervention. It is one informed human decision
per actual authority transition, no Hill-authored mechanical evidence fields,
no deterministic preflight repair loop, and strictly less hosted Hill
orchestration work than the #259 baseline while preserving accepted local
output quality. If local dispatch plus orchestration does not beat the hosted
baseline, the proving disposition is revise or no-adopt rather than success.

The primary cost is
`hosted_hill_input_tokens + hosted_hill_output_tokens` from scope freeze through
accepted local-result normalization. Packet construction, dispatch, polling,
repair, retry, and normalization are included; genuine human decision turns are
excluded symmetrically. Output-quality equivalence requires the same frozen
scenarios and independent acceptance result. Missing trusted counters or
unproven comparability returns `insufficient_baseline` and a no-adopt result
rather than an estimate.

## Acceptance matrix

| ID | Requirement | Minimum proof |
| --- | --- | --- |
| A0 | Automatic reviewed-intent handoff | Mission Builder and exact Fury dispatch evidence materialize one protected content-addressed intent; forged/stale/cross-plan evidence fails |
| A1 | No hand-authored action JSON | Spawned CLI creates exact derived input from reviewed intent |
| A2 | Preflight before PIN | Invalid path/order/root/branch/HEAD/journal/signer cases never request passcode |
| A3 | One clear human decision | Snapshot test contains exact scope, exclusions, remaining gates, PIN/cancel only |
| A4 | No-effect cancel/failure | Spawned CLI proves unchanged journal, Git, GitHub, model, and target bytes |
| A5 | Post-PIN freshness | Every repository/journal/signer drift class blocks before signature append |
| A6 | Exact existing semantics | Derived action input and four replayed entries equal direct existing-command vectors; intent binding remains authority-none |
| A7 | Clean success/retry | One atomic batch append containing four entries, clean terminal return, exact retry cannot duplicate authority |
| A8 | Unsupported state | One stable reason, no PIN, no mutation |
| C1 | Budgeted packet | Exact loaded-instance tokenizer/template proves fit; unavailable or over-budget count fails before inference |
| C2 | Seat/authority isolation | Packet cannot change seat, tools, authority, mission, revision, or output schema |
| D1 | Host evidence separation | Model result cannot override failed/unavailable command receipt |
| D2 | Complete bounded aggregation | Missing/duplicate/reordered/conflicting evidence, over-cardinality, cumulative exhaustion, or many individually fitting packets beyond campaign budget fails closed |
| D3 | Exact replay | Replay performs no command or inference and returns identical evidence; uncertain started work requires recovery |
| E1 | Measured improvement | Before/after evidence uses host/provider counters and authority-none classification |
| E2 | Net local savings | Zero Hill-authored mechanical fields/retries and strictly lower hosted orchestration usage than #259 with accepted local output |

## Validation strategy

Prefer focused Nx-affected targets once #255 boundaries exist; until then use
the package build and exact test files owned by each lane. Each slice defines
one checked-in validation wrapper only if it composes existing targets without
hiding failures or broadening authority.

Required adversarial classes include malformed/extra/accessor/proxy input,
strict duplicate-key JSON and byte/depth/count ceilings, locale/path ordering,
symlink/hardlink/FIFO/device/gitlink/path alias, owner/mode/link and inode/byte
replacement before display/after PIN/before append, signer and journal drift,
cancel/empty/wrong PIN, journal locking/mixed schema/partial
write/rename/fsync/readback uncertainty/orphan state, non-loopback or ambiguous
runtime, model/context/tokenizer/template substitution, cross-packet instance
drift, budget undercount or unavailable exact counter, provider truncation,
packet cardinality/ownership/order/substitution conflict, trusted-command
substitution, campaign request-ID conflict, crash at each store/command/packet
stage, A-B-A replay, and preservation of legacy commands, package exports,
single-packet Mack, and consumer vectors.

## Human output boundary

Routine output must not include full journal projections. It shows:

- exact mission/revision/repository/branch/HEAD;
- exact authority transition, paths, effects, runtime/executor where applicable;
- material exclusions and remaining human gates;
- `Enter PIN to turn the key, or cancel.`

Verbose machine evidence is available through `--json` or an external artifact
reference. PIN bytes are never stored, logged, transmitted, or included in
evidence.

## Notebook boundary

Issue #96/possible Mem0 retrieval may help select reviewed reference entries
for local packets. Notebook or memory output is never a source of current
authority, reviewed intent, repository identity, revision, readiness, or gate
truth. Every retrieved entry remains reference-only and is revalidated.

## Explicit non-goals

- No new authority class or verbal authorization path.
- No inference of planning decisions from issues, prose, changed files, or AI.
- No automatic ready-for-review, merge, deployment, release, cleanup, or final acceptance.
- No passcode storage, relay, memory, or model exposure.
- No unbounded agent loop or generic command interpreter.
- No replacement of Fury, Mack, Fitz, Simmons, or Coulson gates.
- No requirement that all lanes merge in one pull request.

## Fury decisions requested

1. Does the corrected Mission Builder-only parent-plan binding close production
   intent provenance without making Hill reconstruct governance evidence?
2. Is the `@shield/mission-preparation` A0 boundary followed by thin A1
   `authorize-wheels-up` integration the correct first implementation path?
3. Should the local Mack campaign aggregate model scenario assessments by
   exclusive ownership only in V1, deferring combination rules?
4. Are Lane A0, A1, B1, B2, C, D, and authority-none E sufficiently independent
   and predecessor-bound for sequential child issues?

Implementation remains blocked until Fury approves the exact plan and Coulson
authorizes the first child slice.
