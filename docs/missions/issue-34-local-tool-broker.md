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
- The authority provider supplies a unique pre-authorized `cycleId` and
  `effectKey` slot for every requested call. The broker never invents fallback
  identifiers or expands the approved number of calls.
- Calls execute sequentially through the same durable `appendIfAbsent` ledger
  across process restarts. Missing durable consumption evidence disables tool
  mode.

The fixed runner mapping is:

| Tool | Action ID | Effect class | Required capability |
| --- | --- | --- | --- |
| `readFile` | `repository.read_file` | `verification` | `filesystem_read` |
| `listFiles` | `repository.list_files` | `verification` | `filesystem_list` |
| `searchRepo` | `repository.search` | `verification` | `filesystem_search` |

### Raw-result release gate

`RunnerExecutorResult` contains only a bounded sanitized summary and evidence
references. Raw file, listing, and search output is held in broker memory while
the Issue #10 audited executor completes. The broker may release that output to
LM Studio only after `createAuditedExecutor` returns `completed`, proving that
the invocation was consumed and the result audit receipt was verified.

On `failed`, `uncertain`, timeout, exception, invalid receipt, or restart, the
broker discards the raw output, stops tool mode, and never reuses the decision.
Raw output is never stored in the permission ledger or broker event sink.

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
- Tool mode accepts only an IP-literal loopback LM Studio base URL, rejects
  redirects, and binds all inference requests to the exact loaded-instance ID
  returned by the capability probe.
- A requested tool-mode session never silently falls back to text mode.
- Legacy `--context`, file-based prompt input, `--output`, and reasoning display
  are disabled in tool mode. Their existing behavior remains unchanged in text
  mode.

### Filesystem race boundary

For every filesystem operation the broker verifies the canonical repository
root and its device/inode before and after access. File reads use a final-
component no-follow open, read through the descriptor, validate a regular file
after opening, and suppress output on any identity mismatch. Directory walks do
not follow symlinks and repeat root identity verification before releasing a
result.

Direct `rg` remains acceptable only for the Phase 1 same-user host model: the
broker uses the trusted canonical executable, prevents symlink traversal, and
revalidates the root before releasing output. A malicious same-host process
capable of namespace swap-and-restore attacks is explicitly outside Phase 1.
If that attacker enters scope, direct `rg` cannot prove confinement and the
mission stops for an OS-sandbox redesign.

### Sensitive-path and subprocess controls

All three tools deny `.git/**`, `.env*`, private keys, credential stores,
tokens, authentication material, and equivalent sensitive paths by closed
case-insensitive path rules. Denied paths and patterns are never recorded in an
event body.

`searchRepo` resolves one trusted canonical `rg` executable before the session,
uses `shell: false`, `--no-config`, a fixed argument vector, `--` before every
model-controlled value, and a minimal controlled environment. The model cannot
select flags, executables, working directories, environment variables, or
configuration files.

### Normative limits

Limits are measured in UTF-8 encoded bytes and enforced while input or output
is streaming rather than after unbounded buffering.

| Limit | Maximum |
| --- | ---: |
| Tool argument JSON | 4,096 bytes; depth 4 |
| Repository-relative path | 512 bytes |
| Search pattern | 512 bytes |
| `readFile` result | 65,536 bytes; 2,000 lines |
| `listFiles` result | 1,000 items; 65,536 bytes |
| `searchRepo` result | 500 matches; 131,072 bytes; 2,000 lines |
| Aggregate released tool output | 262,144 bytes |
| LM Studio response | 1,048,576 bytes |
| Returned error | 512 bytes |
| Tool rounds | 8 |
| Total tool calls | 16 |
| `rg` subprocess | 5 seconds |
| One inference request | 120 seconds |
| Whole tool-mode session | 300 seconds |

Raw tool arguments are parsed with duplicate-key detection before conversion
to closed plain data. Duplicate keys, duplicate tool-call IDs anywhere in the
session, sparse or accessor-backed arrays/objects, non-plain prototypes,
non-finite numbers, control characters, unknown fields, excessive nesting, or
oversized values fail closed without invoking accessors or tools.

### Protocol completion and broker events

Multiple tool calls in one assistant response execute sequentially in declared
order. A terminal assistant message is accepted only when no call is
outstanding and at least one tool invocation completed with verified decision,
invocation, and result audit receipts. Final model text is labeled untrusted
model output; it is not itself verified reconnaissance evidence.

An injected durable append-only broker event sink records conditions that occur
before a valid runner plan exists: malformed calls, pre-authorization denials,
caps, timeouts, truncation, capability failure, and protocol failure. It is
non-authoritative and cannot grant permission or alter journal state. Events
contain only closed codes, counters, opaque identifiers, and evidence
references—never arguments, paths, patterns, file bodies, tool output, model
output, credentials, or private reasoning. Event append failure stops tool mode.

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
- [ ] Every call consumes one authority-provider-supplied cycle/effect slot
  through the durable Issue #10 ledger; the broker mints no authority IDs.
- [ ] Raw tool output is released only after the audited executor returns
  `completed`; every other outcome discards it and stops tool mode.
- [ ] Missing, stale, mismatched, replayed, substituted, malformed, excessive,
  or unauthorized calls do not invoke a tool.
- [ ] Paths remain within the exact canonical repository root and symlink
  escapes fail closed.
- [ ] `searchRepo` invokes only `rg` with a closed argument vector and no shell.
- [ ] Root identity, descriptor-based file safety, the same-host threat-model
  limit, sensitive-path exclusions, and controlled `rg` environment match the
  frozen architecture.
- [ ] Outputs, errors, time, rounds, and total calls are bounded and auditable.
- [ ] Strict parsing rejects duplicate keys and IDs, hostile shapes, control
  characters, and unknown or oversized values without invoking accessors.
- [ ] Protocol completion requires an audited tool result, and pre-plan broker
  failures are durably recorded without sensitive arguments or output.
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
