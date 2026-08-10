# Issue #268 — key-turn governance evidence parent plan

## Frozen identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `fc47ccf5b47fc1b340d1ec80a5c025ac7fd04344`
- Parent issue: `#268`
- Related: `#96`, `#161`, `#196`, `#203`, `#236`, `#240`, `#251`
- Authority: planning and read-only reconnaissance only
- Human authority remains with Coulson, Fitz, and Simmons.

## Objective

Make a routine SHIELD transition feel like a key turning a lock:

1. Hill freezes the small set of planning decisions that cannot be observed.
2. Deterministic software derives every live repository, journal, signer,
   revision, path, effect, runtime, and gate fact.
3. The complete transition is preflighted before a passcode prompt.
4. Coulson sees only the exact decision, exclusions, remaining human gates,
   and PIN/cancel action.
5. A successful PIN performs exactly one existing authorized transition and
   returns to an empty shell prompt.

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

### The key is a reviewed plan intent, not inferred authority

Repository and journal observations cannot determine planning decisions such
as approved implementation paths, effects, capabilities, validation lanes, or
runtime choice. `prepare-next` must not infer those decisions from an issue,
model prose, changed files, notebook memory, or repository heuristics.

Define one closed, content-addressed `mission.transition-intent.v1` produced by
Mission Builder/Helicarrier from an exact Fury-reviewed plan. It contains only
the decisions that cannot be observed:

- mission and reviewed-plan identity;
- transition family and bounded desired outcome;
- approved implementation/publication paths;
- approved action, effect, capability, and validation IDs;
- selected seat, model, runtime, and executor identities where applicable;
- explicit exclusions;
- packet/validation campaign declarations where applicable.

The intent grants no authority. Its exact digest is an input to preparation,
signing, receipts, packet compilation, and replay. Current repository, branch,
HEAD, base ancestry, path kinds, journal sequence/state, signer binding,
authority identities, timestamps, runtime observation, and remaining gates are
always host-derived.

### One dispatcher, existing transition meanings

Add one canonical operator command:

```text
shield mission prepare-next \
  --mission-id mission:issue-N \
  --intent <reviewed-transition-intent.json>
```

Interactive mode prepares, preflights, and renders the exact next eligible
transition, then prompts once. Machine mode may emit the prepared candidate and
human-decision projection without signing or appending.

The dispatcher calls transition-specific adapters that reuse the existing
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

No temporary action-specific JSON is required from the operator. Preparation
may use protected external temporary artifacts, but they are authority-none,
credential-free, create-only, and safely disposable.

After PIN entry and before signing/append, the existing transition path repeats
its full freshness observation. Snapshot reuse may reduce duplicate reads only
where the current contract can prove retained identity; it must not weaken the
post-passcode drift check.

## Sequential implementation lanes

All lane briefs, worktrees, dependency installation, exact base, validation
commands, and stop conditions should be prepared in one setup operation. Lanes
then execute in order. Each lane ends with an exact-head Mack packet and Fury
conformance before the next lane begins.

### Lane A — key-turn fresh-mission vertical slice

Deliver the reviewed-intent contract, pure next-transition selector, action
input compiler for fresh schema-9 `authorize-wheels-up`, concise human decision
projection, and canonical `prepare-next` CLI path. Reuse:

- `validateAuthorizeWheelsUpInput` semantics;
- `prepareAuthorizeWheelsUp`;
- `renderAuthorizeWheelsUpHumanV1`;
- `signPayloadBatchWithSigner`;
- `appendProfileAwareMissionEntriesAtomicV1`;
- canonical publication-path ordering.

Do not replace the intended distinction between ordinary sorted identifiers
and canonical publication paths. Do not collapse pre- and post-passcode
freshness into one stale snapshot.

Lane A is complete when a fresh mission can be prepared and authorized without
hand-authored action JSON and with exactly one human decision prompt.

### Lane B — additional existing transition adapters

Add supported publication-only and runtime-binding preparation through the same
intent/dispatcher boundary. Every adapter produces the exact input already
accepted by the existing command and invokes the existing authority path.

Do not add a generic dynamic command interpreter. Unsupported or ambiguous
mission states return one stable reason and no PIN prompt or mutation.

### Lane C — bounded local packet compiler

Add a host-neutral packet compiler used by local Daisy, May, and Mack. Input is
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

Tokenizer accuracy is provider-specific. The host must use a trusted provider
token-count boundary when available; otherwise it uses a conservative declared
estimator and cannot label the packet exact-fit. Model-reported counters are
post-dispatch observations, not preflight proof.

### Lane D — governed multi-packet Mack campaign

Extend local Mack additively with a campaign contract rather than weakening the
existing single-packet request. One campaign binds:

- exact mission, subject, repository, base, artifact HEAD, and changed paths;
- one host-executed ordered validation-lane receipt set;
- ordered packet specifications partitioning scenarios/evidence;
- exact runtime/model/executor identity and campaign context budget;
- complete required-scenario coverage and packet-result cardinality;
- each packet request, prompt, response, and assessment digest;
- one stable campaign ID and digest.

Host commands execute once for the campaign. Model packets may only assess
their assigned evidence. The aggregate report is derived by the host:

- every required host lane must pass;
- every required scenario must have exactly one permitted assessment owner or
  an explicit deterministic combination rule;
- failed/uncertain assessments veto coverage;
- missing, duplicate, stale, cross-runtime, cross-revision, reordered, or
  conflicting packet evidence fails closed;
- model `advance`/PASS prose cannot create eligibility;
- replay returns the exact durable campaign record and performs no second host
  command or model invocation.

The existing one-packet Mack contract remains valid and unchanged.

### Lane E — before/after dogfood proof

Run the key-turn command on a fresh bounded mission and compare it with #259.
Record authority-none metrics from host/provider sources:

- Hill-authored structured fields;
- manual commands and retries;
- pre-PIN preflight failures;
- human decisions and PIN prompts;
- Hill tokens;
- local packet input/output/reasoning tokens;
- repeated repository/context reads;
- elapsed time;
- handoffs and repair cycles.

The target is not zero human intervention. It is one informed human decision
per actual authority transition and no human effort spent repairing mechanics.

## Acceptance matrix

| ID | Requirement | Minimum proof |
| --- | --- | --- |
| A1 | No hand-authored action JSON | Spawned CLI creates exact derived input from reviewed intent |
| A2 | Preflight before PIN | Invalid path/order/root/branch/HEAD/journal/signer cases never request passcode |
| A3 | One clear human decision | Snapshot test contains exact scope, exclusions, remaining gates, PIN/cancel only |
| A4 | No-effect cancel/failure | Spawned CLI proves unchanged journal, Git, GitHub, model, and target bytes |
| A5 | Post-PIN freshness | Every repository/journal/signer drift class blocks before signature append |
| A6 | Exact existing semantics | Derived input/replayed entries equal direct existing-command vectors |
| A7 | Clean success/retry | One append, clean terminal return, exact retry cannot duplicate authority |
| A8 | Unsupported state | One stable reason, no PIN, no mutation |
| C1 | Budgeted packet | Over-budget fails before inference; exact artifacts and allowances are reported |
| C2 | Seat/authority isolation | Packet cannot change seat, tools, authority, mission, revision, or output schema |
| D1 | Host evidence separation | Model result cannot override failed/unavailable command receipt |
| D2 | Complete aggregation | Missing/duplicate/reordered/conflicting packet or scenario evidence fails closed |
| D3 | Exact replay | Campaign replay performs no command or inference and returns identical evidence |
| E1 | Measured improvement | Before/after evidence uses host/provider counters and authority-none classification |

## Validation strategy

Prefer focused Nx-affected targets once #255 boundaries exist; until then use
the package build and exact test files owned by each lane. Each slice defines
one checked-in validation wrapper only if it composes existing targets without
hiding failures or broadening authority.

Required adversarial classes include malformed/extra/accessor/proxy input,
locale/path ordering, symlink/gitlink/path alias, signer and journal drift,
cancel/empty/wrong PIN, partial append/durability uncertainty, runtime identity
drift, context substitution, budget undercount, packet cardinality conflict,
and campaign replay after interruption.

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

1. Is `mission.transition-intent.v1` the correct minimal trust-neutral source of
   non-observable planning decisions, and should Mission Builder or Helicarrier
   be its sole production compiler?
2. Is the fresh `authorize-wheels-up` vertical slice the correct first key-turn
   implementation boundary?
3. Should the local Mack campaign aggregate model scenario assessments by
   exclusive ownership only in V1, deferring combination rules?
4. Are Lanes A-E correctly separated into bounded child PRs, or should Lane C/D
   remain a separate child issue from the operator key-turn path?

Implementation remains blocked until Fury approves the exact plan and Coulson
authorizes the first child slice.
