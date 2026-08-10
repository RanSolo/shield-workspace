# Mission #130 — Governed local-May dispatch command

Status: proposed; planning and reconnaissance only

## Objective

Add the smallest operator-facing command that can dispatch exactly one bounded
local May implementation cycle through the existing governed
`runMayControlLoop(...)` executor. The command must compose durable mission
state, shared runtime instructions, an exact SHIELD context, runtime identity,
permission and audit dependencies, workspace observations, approved files, and
approved validation commands without treating caller prose or a packet file as
authority.

## Proposed command surface

```text
shield mission dispatch \
  --mission-id <id> \
  --seat may \
  --runtime local \
  --packet <file> \
  [--root <path>] \
  [--json]
```

The first version is closed to `seat=may` and `runtime=local`. It advances at
most one control-loop session and stops after its recorded result or any
fail-closed condition. A packet supplies bounded requested work and references;
it never supplies or upgrades mission authorization, executable paths, tool
capabilities, runtime bindings, or publication authority.

## Current evidence

- `scripts/model/ask-local.mjs` uses only the selected seat prompt as
  `system_prompt` and concatenates mission prose plus context files into user
  input. It does not compose or validate the proposed shared runtime
  instructions and SHIELD context block.
- `runMayControlLoop(...)` is implemented and tested, but its production host
  dependencies remain caller-injected: runner slots, permission contexts,
  audit append/readback, control events, runtime and executor identities,
  workspace revision/status observations, approved files, validation-command
  definitions, timestamps, and temporary-name generation.
- `shield mission ...` currently creates, authorizes, reads, and advances the
  supervised journal, but `mission step` is journal-only and does not dispatch
  a seat, invoke a model, execute a tool, or record a dispatch receipt.
- Issue #42 delivered the bounded local May executor. Issue #130 owns runtime
  composition. Issue #97 owns command discovery and should list this command
  only after it becomes operational.

## Delivery slices

## Local packet-sizing experiment

Local Daisy and May packets are operational experiments, not fixed-size
templates. Hill will seek the highest useful work per second while preserving
grounding and output quality.

- Start with one question or edit, one or two authoritative files, and roughly
  2,000–5,000 input tokens.
- Expand only when the prior packet proves that a missing adjacent interface is
  necessary; do not attach broad repository context preemptively.
- Ask for a concise closed output so generation time does not dominate useful
  reasoning time.
- Record input tokens, time to first token, total elapsed time, factual errors,
  directly usable output, and host correction cost for each proving packet.
- Treat 45 seconds without a usable result as a signal to stop and shrink the
  packet, while Hill continues non-overlapping work instead of waiting idle.
- Do not repeat work solely to benchmark sizes. Each packet must answer a real
  mission question or produce an eligible bounded change.
- Two materially incorrect grounded attempts trigger a conscious runtime or
  host-executor decision; they do not justify relabeling host work as local-seat
  work.

The initial evidence suggests that 10,000+ token inventories are informative
but slow, while 20,000+ token implementation packets lose grounding. The target
range remains provisional until this mission records comparable Daisy and May
packets.

### Initial packet evidence

| Seat and task | Input | TTFT | Output | Observed utility |
| --- | ---: | ---: | ---: | --- |
| May, one runbook paragraph | 2,467 tokens | 2.45 s | 1,639 tokens | Useful field inventory; one incorrect context/argument conflation required a small host correction. |
| Daisy, one shared-validator seam | 2,594 tokens | 2.80 s | 870 tokens | Directly useful evidence inventory; one minor item-count error and near-zero correction cost. |
| Daisy, CLI routing seam without the full contract | 1,684 tokens | 1.61 s | 803 tokens | Fast but under-contextualized; found the CLI branch and read-only root helper, then incorrectly reduced dispatch preflight to model availability. High host correction cost. |
| Daisy, packet/context trust boundary | 1,391 tokens | 1.19 s | 773 tokens | Correctly separated untrusted work intent from host authority, but omitted required fields and exceeded the requested shape. Useful with moderate host correction. |
| Daisy, full May executor dependency map | 12,486 tokens | 18.27 s | 3,380 tokens | Broadly useful but slow and included incorrect assumptions about model-origin injection. |
| May, large evidence/test comparison | 20,264–22,751 tokens | 39–41 s | 534–585 tokens | Slow and insufficiently grounded; proposed redundant or already-present changes. |

The current best operating point for Daisy-style reconnaissance is therefore
approximately 2,500–5,000 input tokens with an output request below 1,000
tokens. May implementation quality also depends on edit complexity: a small
packet does not make a security-sensitive whole-file rewrite safe by itself.

### PR A — closed dispatch context and preflight

- Add a closed `LocalMayDispatchPacketV1` for requested work, approved artifact
  references, output contract, and stop condition.
- Compose shared runtime instructions, the exact May seat prompt, and a closed
  SHIELD context from validated repository and mission state.
- Derive repository root, branch, exact HEAD, mission revision, authorization,
  runtime binding, approved paths, and validation command IDs from trusted host
  sources rather than packet prose.
- Add a read-only preflight result that reports `dispatch_ready` or one stable
  fail-closed reason. Preflight must not invoke a model or tools and must not be
  presented as dispatch.

### PR B — one governed local May cycle

- Compose the existing `runMayControlLoop(...)` dependencies from durable
  repository stores and validated host adapters.
- Probe and bind the exact LM Studio model instance on loopback.
- Append and verify dispatch lifecycle, permission, invocation, result, and
  control-loop evidence.
- Execute only approved file writes and validation command IDs.
- Return a closed terminal status bound to the exact starting and resulting
  repository state.
- Add the operational command to the Hill command index only after a real
  proving run succeeds.

## Acceptance criteria

- The runtime receives shared instructions, the May seat prompt, and a separate
  machine-validated SHIELD context block.
- The context binds mission, repository, branch, exact revision, authority,
  runtime/model, executor, approved tools, approved paths, validation commands,
  output contract, and stop conditions.
- Signed mission authorization and the exact implementation gate are replayed
  from durable evidence immediately before dispatch.
- Packet content cannot create authority, choose executables, broaden writable
  paths, alter runtime identity, or authorize GitHub effects.
- The command invokes the existing governed May loop rather than
  `ask-local.mjs` and preserves actual seat, runtime, model, and executor
  identity in receipts.
- Missing, stale, malformed, ambiguous, mismatched, failed, or uncertain state
  fails closed without model invocation or additional effects where possible.
- Focused tests cover successful preflight, stale HEAD, dirty out-of-scope
  paths, missing authorization, stale plan gate, runtime mismatch, command or
  path injection, audit failure, and uncertain tool outcomes.
- One small local proving packet edits one approved documentation fixture, runs
  one approved validation command, and records exact evidence.

## Boundaries

- No generic multi-seat dispatcher, Daisy execution, scheduler, daemon, HTTP
  API, Mission Control UI, or automatic runtime substitution.
- No arbitrary shell, caller-selected executable or arguments, broad writable
  workspace, GitHub publication, merge, deployment, release, or production
  effect.
- No new authority class and no conversion of verbal or packet prose into
  authorization.
- No claim that PR A is operational local-May dispatch.

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: true
- externalCommunication: false
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

This changes a tool-execution and authority boundary. It requires explicit
Coulson approval and is not eligible for lightweight timeout activation.

## Participants and routing

- Hill: scope, packet boundaries, CLI orchestration, and evidence handoffs.
- Daisy local: small read-only dependency and call-site reconnaissance packets.
- Fury: exact-plan and exact-revision conformance review.
- May local: one bounded implementation packet per PR after an eligible gate.
- Mack: omitted for this experiment by human direction.
- Fitz: final human technical review remains pending and cannot be simulated.

## Current gate

Await explicit Coulson approval of this Mission Brief before activating
Delivery Mode, publishing a Mission Workspace, or implementing PR A.
