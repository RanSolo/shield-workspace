# Mission Brief: Issue #34 Daisy Local Tool Broker

- **Canonical issue:** `RanSolo/shield-workspace#34`
- **Mission state:** Wheels Up authorized by Phil Coulson
- **Base revision:** `c4290cfa1f54e1b081a06796720b2cd13a6996e7`
- **Delivery strategy:** standard sequential S.H.I.E.L.D.
- **Implementation owner:** Melinda May
- **Human authority:** Phil Coulson

## Objective

Deliver the smallest host-side broker that lets a local Daisy reasoning runtime
request bounded, read-only repository reconnaissance tools through LM Studio.
Every actual tool invocation must cross the Issue #10 permission boundary. The
model receives tool descriptions and results, never shell or filesystem
authority.

## Dependency gate

Issue #10 is complete through merged PR #53. Its three-identity model,
authoritative runtime binding, fresh per-call permission decision, host
attestations, and append-only audit ledger are mandatory inputs to this mission.

Issue #34 owns environmental probes, tool definitions, argument validation,
repository confinement, bounded execution, and the LM Studio tool loop. It does
not mint runtime bindings, grant authority, or redefine mission state.

## Evidence

- `scripts/model/ask-local.mjs` currently performs one stateless native
  `/api/v1/chat` request and parses final text; it advertises no custom tools.
- LM Studio custom function tools use the OpenAI-compatible
  `/v1/chat/completions` or `/v1/responses` endpoints. The native
  `/api/v1/chat` endpoint does not accept custom tools.
- `GET /api/v1/models` exposes loaded instances and
  `capabilities.trained_for_tool_use`; the broker must verify the selected model
  before advertising tools.
- Issue #10 exposes `createPermissionAuthorizer` and `createAuditedExecutor`.
  Those contracts require distinct seat, reasoning-runtime, and executor
  identities and a fresh verified audit receipt immediately before execution.
- Daisy reconnaissance consumed 27,037 input tokens, 3,633 output tokens, and
  986 reasoning tokens, with 49.883 seconds to first token.

## Frozen Phase 1 scope

### Closed Daisy tool set

- `readFile` — read one UTF-8 regular file within the authorized repository.
- `listFiles` — return a bounded deterministic list within an authorized
  directory.
- `searchRepo` — invoke `rg` directly with a closed argument vector and no
  shell, returning bounded matches within the authorized repository.

Read-only Git inspection, Hill/May/Fury capability sets, writes, builds, tests,
network tools, MCP publication, and general routing are deferred.

### Repository confinement

- The host canonicalizes the repository root with `realpath`.
- The expected repository identity and canonical root must match the fresh
  Issue #10 context.
- Every requested path is a repository-relative string with a closed shape.
- Lexical traversal, absolute paths, NUL bytes, empty components, and unknown
  fields fail closed.
- Existing targets are canonicalized before access. Symlinks that resolve
  outside the root fail closed.
- `readFile` accepts regular files only. `listFiles` and `searchRepo` never
  follow directory symlinks.

### Bounds

- Tool schemas use exact structured arguments; shell command strings are never
  accepted.
- Each result has deterministic byte, line, and item limits with explicit
  truncation metadata.
- Subprocess and inference calls have bounded timeouts.
- A conversation has fixed maximum tool rounds and total calls.
- Unknown, malformed, duplicate, excessive, timed-out, or unsupported requests
  fail closed and return bounded non-secret errors.

### Permission and audit integration

- The broker accepts a trusted host dependency that derives fresh Issue #10
  permission context from authoritative journal state.
- No CLI flag, prompt, model output, environment value, or arbitrary JSON file
  may create or substitute a binding.
- Each requested tool call maps to one runner plan with Daisy as `seatId`, the
  actual local model as `reasoningRuntimeId`, and the broker host as
  `toolExecutorId`.
- Every call obtains a new decision ID, current journal sequence, exact branch
  and artifact revision, repository-root and writability attestations, and the
  capability attestation required by that tool.
- One allowed decision is consumed by exactly one invocation and one result.
- Audit records contain bounded summaries and evidence references, never file
  bodies, raw model output, secrets, or private reasoning.
- Missing or malformed authority-provider dependencies disable tools. Existing
  text-only `ask-local.mjs` behavior remains available.

### LM Studio boundary

- Preserve `/api/v1/chat` for the existing text-only path.
- Use `/v1/chat/completions` for the custom-tool path because official LM Studio
  documentation identifies it as a custom-tool-capable endpoint.
- Probe `/api/v1/models` first and exact-match the configured model key or
  loaded-instance ID. Missing, ambiguous, unloaded, or non-tool-trained models
  fail closed.
- Parse assistant tool calls as untrusted input. Add the assistant tool-call
  message and bounded tool results to the next request exactly as required by
  the compatible protocol.

## Threat model

Fury Threat Review must specifically evaluate:

- forged seat, runtime, executor, repository, branch, revision, or binding;
- stale, replayed, duplicated, or substituted permission decisions;
- hostile objects, accessors, sparse arrays, malformed JSON arguments, and
  duplicate tool-call identifiers;
- lexical traversal, symlink escape, root replacement, and time-of-check to
  time-of-use races;
- shell injection through search patterns, paths, or model content;
- output used to exfiltrate secrets or overwhelm model context;
- timeouts, broker restart, partial result, audit failure, and uncertain state;
- a model claiming final success without completing requested reconnaissance.

## Expected implementation surface

- a host-side broker module under `scripts/model/`;
- minimal `ask-local.mjs` tool-mode integration while preserving text mode;
- focused broker and model-harness tests;
- bounded documentation updates for configuration and security behavior.

No Kernel or Mission Journal schema change is expected. Any need to change
authority semantics stops implementation and returns to Coulson.

## Acceptance criteria

- [ ] The selected LM Studio model is verified through a host-observed
  capability probe before tools are advertised.
- [ ] Daisy can complete a multi-turn reconnaissance request through the three
  closed read-only tools when a valid Issue #10 authority provider is present.
- [ ] A fresh permission decision and verified pre-invocation audit receipt are
  required for every individual tool call.
- [ ] Missing, stale, mismatched, replayed, substituted, malformed, excessive,
  or unauthorized calls do not invoke a tool.
- [ ] Paths remain within the exact canonical repository root and symlink
  escapes fail closed.
- [ ] `searchRepo` invokes only `rg` with a closed argument vector and no shell.
- [ ] Outputs, errors, time, rounds, and total calls are bounded and auditable.
- [ ] Audit attribution preserves Daisy seat, actual reasoning runtime, and
  actual broker executor without recording secrets, private reasoning, or raw
  file bodies.
- [ ] Existing text-only local-model behavior remains compatible.
- [ ] Focused tests cover allowed tools, every denial class, traversal,
  symlinks, hostile shapes, truncation, timeout, round/call caps, permission
  reuse, audit failure, restart, and model-capability failure.
- [ ] Package tests, workspace tests, packed strict-consumer validation,
  package dry run, and `git diff --check` pass.

## Explicit non-goals

- unrestricted terminal or shell access;
- write, build, test, Git mutation, GitHub, network, credential, or destructive
  operations;
- tool authority for Hill, May, Fury, Coulson, Fitz, or Simmons;
- runtime-binding creation, substitution, fallback, or autonomous escalation;
- Kernel, journal, routing, occupancy, dashboard, or general MCP changes;
- merge, deployment, release, or production effects.

## Delivery gates

1. Daisy reconnaissance — complete.
2. Hill Mission Brief — this artifact.
3. Fury Threat Review — required before implementation.
4. Verified draft PR Mission Workspace — required before May dispatch.
5. May implementation and focused tests — one owner, sequential.
6. Hill integration validation.
7. Fury Conformance Review at the exact head.
8. Fitz final technical review.
9. Coulson retains merge authority.
