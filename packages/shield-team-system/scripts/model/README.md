This folder contains model-selection helpers and the local-model adapter used by
SHIELD roles.

## Local model teammate

LM Studio must be serving a compatible model on port 1234. Ornith 1.0 35B is
the current default, but it is not baked into the team identity. Run a role with
an inline mission:

```bash
node scripts/model/ask-local.mjs orchestrator "Choose the next issue and state the stop condition."
```

For a larger mission, use a file or stdin:

```bash
node scripts/model/ask-local.mjs implementer --file mission.md
cat mission.md | node scripts/model/ask-local.mjs reviewer
```

Give the model authoritative repository context with one or more `--context`
arguments:

```bash
node scripts/model/ask-local.mjs implementer \
  "Review the adapter and recommend the next validation step." \
  --context scripts/model/ask-local.mjs \
  --context tests/model-harness.test.mjs
```

Role prompts tell Ornith how to work; context files tell it what is actually in
the repository. Calls without context are appropriate only for generic routing
or planning questions.

The adapter uses LM Studio's native `/api/v1/chat` endpoint. It prints only the
local model's actionable message by default. Diagnostic output is opt-in:

```bash
node scripts/model/ask-local.mjs investigator --file mission.md --show-reasoning --show-stats
```

Save a long artifact for supervisor review instead of printing it:

```bash
node scripts/model/ask-local.mjs architect --file mission.md --output /tmp/local-draft.md
```

Configuration:

- `LOCAL_MODEL_BASE_URL` defaults to `http://127.0.0.1:1234`.
- `LOCAL_MODEL_ID` defaults to `ornith-1.0-35b`.
- `LOCAL_MODEL_API_TOKEN` is optional and is sent only when LM Studio authentication
  is enabled.

Calls are stateless by default (`store: false`) so repository missions do not
accumulate as persistent LM Studio chat history.

## Governed Daisy reconnaissance tools

`@shield/team-system/local-tools` exposes the Phase 1 host API for bounded local
Daisy reconnaissance. It provides only `readFile`, `listFiles`, and
`searchRepo`. Custom tools use LM Studio's `/v1/chat/completions` endpoint after
an exact `/api/v1/models` capability probe; the existing text-only CLI continues
to use `/api/v1/chat`.

Tool mode is intentionally programmatic. A standalone CLI flag cannot establish
authoritative runtime bindings, fresh journal state, durable permission
consumption, or audited result receipts. The trusted host must inject the Issue
#10 context provider, append-only permission ledger, pre-authorized call slots,
and non-authoritative broker event sink. Missing dependencies fail closed and
never fall back to text mode.

Repository paths are canonical-root confined, sensitive paths are excluded,
results are bounded, and raw tool output is released to the model only after the
audited executor reports `completed`. Final model prose is labeled untrusted
model output rather than verified reconnaissance evidence.

Before a trusted host relies on local Daisy broker evidence, it should run the
broker compatibility probe exposed by `probeLocalToolCompatibility(...)`. The
metadata probe checks that LM Studio has exactly one loaded tool-capable model
instance, but metadata such as `trained_for_tool_use: true` is not sufficient.
The compatibility probe also verifies that the selected model/template can emit:

- a clean assistant tool-call turn with no assistant prose in `content`; and
- a clean final assistant message after tool results with no tool call.

Dedicated reasoning fields such as `reasoning` or `reasoning_content` may be
normalized, ignored, or quarantined by the host when the turn is otherwise
clean. Reasoning or prose leaked into assistant `content` alongside a tool call
remains ambiguous and fails closed as `lm_response_ambiguous`. In LM Studio,
reasoning/thinking mode and chat-template behavior can affect this boundary.

Operator-facing diagnostics are intentionally narrow:

- `model_unavailable` means the endpoint, model load, ambiguity, or timeout
  prevents a trusted broker session. Chat endpoint HTTP 5xx responses remain in
  this category.
- `model_not_tool_capable` means the loaded model did not advertise tool-use
  training.
- `endpoint_or_template_incompatible` means the response shape or protocol turn
  does not match the broker contract. A chat endpoint HTTP 4xx rejection of the
  bounded probe is reported here with only its numeric status and probe phase;
  the response body is never exposed.
- `ambiguous_tool_response` means the model mixed assistant `content` with a
  tool call.
- `broker_policy_denied` means the model requested an operation outside the
  active authority policy.

When compatibility fails, use `ask-local` with explicit context files as the
fallback for context-supplied reconnaissance. That fallback does not produce
governed broker evidence and must not be treated as readiness.

## Governed May implementation calls

`@shield/team-system/local-tools` also exports `runMayToolCall` as the first
Issue #42 executor slice. It accepts exactly one `writeFile` or `runValidation`
call from a trusted host:

- `writeFile` requires a host-approved relative path, the bound workspace Git
  revision, and either the exact current SHA-256 or an explicit `absent`
  precondition;
- `runValidation` accepts only a host-owned command ID whose executable,
  argument vector, timeout, and executable identity were pinned before the
  permission request, snapshots the identity and SHA-256 of every approved
  dirty path, and reports an uncertain stop if validation changes the path set
  or any snapshotted file;
- both operations derive an exact effect key, receive a fresh Issue #10
  permission decision, and release their bounded result only after the
  invocation and result audits are verified;
- a trusted workspace-status provider must prove that every dirty path remains
  inside the host-approved file set before and after an effect.

The model cannot select a repository root, executable, arguments, environment,
working directory, approved file list, revision, or authority context. The
executor has no shell, GitHub, merge, deployment, release, or external
communication tool.

This slice is a host-callable executor contract, not yet the iterative May LM
Studio session. Issue #42 remains open until the model-to-executor loop proves
the complete inspect, edit, validate, correct, and report workflow.

Role aliases map to the seat prompts in `agents/`: `orchestrator`/`hill`/`stinger`,
`investigator`/`daisy`/`jester`, `architect`/`fury`/`viper`,
`implementer`/`may`/`iceman`, `reviewer`/`fitz`/`goose`, `product`/`simmons`,
and `human`/`coulson`/`maverick`.

Run the adapter tests with:

```bash
node --test tests/model-harness.test.mjs
```

## Seat model selection

Before starting a mission, create a project-local seat config.

1. Copy:

```bash
cp scripts/model/seat-models.example.sh scripts/model/seat-models.sh
```

2. Edit `scripts/model/seat-models.sh` with the models actually available for
that repo or machine.

The repository should carry the example file. The real `seat-models.sh` is
project-local and can differ between environments.

Primary seats:

- `DAISY_MODEL`
- `HILL_MODEL`
- `FURY_MODEL`
- `MM_MODEL`
- `FITZ_MODEL`
- `SIMMONS_MODEL`
- `COULSON_MODEL`
- `MACK_MODEL`

Example defaults in `seat-models.example.sh`:

- `DAISY_MODEL=ornith-1.0-35b`
- `HILL_MODEL=ornith-1.0-35b`
- `FURY_MODEL=gpt-5.3-codex`
- `MM_MODEL=gpt-5.3-codex`
- `FITZ_MODEL=$MM_MODEL`
- `SIMMONS_MODEL=human`
- `COULSON_MODEL=human`

Helpers:

- `get_seat_model <daisy|hill|fury|mm|mack|fitz|simmons|coulson>`
- `select_seat_model <seat> [export]`

Compatibility aliases are also available:

- `stinger -> hill`
- `jester -> daisy`
- `viper -> fury`
- `iceman -> fury`
- `goose -> fitz`
- `maverick -> coulson`

Example usage:

```bash
source "$(dirname "$0")/model/escalation.sh"
select_seat_model hill export
echo "Hill is using: $SELECTED_MODEL"
```

If `scripts/model/seat-models.sh` does not exist, the helper falls back to the
example defaults baked into `escalation.sh`.

## Tier compatibility

Behavior

- Default models are configurable via environment variables:
  - DEFAULT_MODEL (fallback if nothing specified)
  - CHEAP_MODEL
  - STANDARD_MODEL
  - STRONG_MODEL

- Functions provided by sourcing this file:
  - get_model <cheap|standard|strong|default>
  - escalate_model <trigger>
  - select_model <trigger> [export]

Triggers are advisory strings like: token_limit, failure, high_risk, code_review.

Example usage from a script:

  source "$(dirname "$0")/model/escalation.sh"
  MODEL_TO_USE=$(escalate_model failure)
  # or export for later usage
  select_model failure export
  echo "Using model: $SELECTED_MODEL"
