# Issue #319 — governed GitHub Copilot Fury plan dispatch

## Frozen identity

- Issue: `#319`
- Parent: `#118`
- Repository: `RanSolo/shield-workspace`
- Planning base and exact reviewed repository revision: `c88a147110e5c94359ca50d4c160037ddfaf95d0`
- Authority during planning and technical review: `none`
- Objective: add one execute-once GitHub Copilot Fury plan-review host operation that produces the exact structured plan, structured PASS review, and durable terminal receipt consumed by `shield mission record-reviewed-transition`.

This plan does not authorize implementation, NXT-458 execution, May, Mack, publication, merge, deployment, release, or human decisions.

## Verified baseline

Current main already provides the durable pieces on either side of the gap:

- `@shield/mission-preparation` validates closed transition-plan v1/v2 artifacts.
- `mission-preparation-host-v1.mts` builds and validates `mission.transition-plan-review.v1`, resolves dispatch identity, and materializes the protected reviewed-transition graph.
- `seat-dispatch-store.mts` provides execute-once packet claiming and durable lifecycle append/readback through `.shield/dispatch-receipts.jsonl`.
- `mission record-reviewed-transition` consumes a plan file, PASS review file, and terminal receipt ID.
- `copilot-teammate-readiness-v1.mts` validates the repository Copilot cards and observes VS Code/Copilot availability, but it does not invoke Fury.

The missing operation is the bounded producer between those surfaces. GitHub Copilot's current supported programmatic surfaces can preselect a named custom agent (`agent` plus `customAgents`) and expose session/subagent lifecycle events through `@github/copilot-sdk`; current latest is `1.0.11`. The implementation must pin the dependency and use that supported API rather than infer identity from display text or scrape an interactive terminal.

## Acceptance matrix

| ID | Required behavior | Planned evidence |
| --- | --- | --- |
| AC-1 | Discoverable normal mission-preparation operation | `shield mission dispatch-fury-plan-review` plus exported host function |
| AC-2 | Exact mission/repository/plan binding | closed request validator, live root/branch/HEAD checks immediately before claim and immediately before terminal append |
| AC-3 | Proven Fury card precedence | resolver records canonical seat `fury`, source kind, portable logical ref, content digest, repository revision when applicable, and complete precedence observations before claim |
| AC-4 | Explicit user override only | repository card is default; an existing same-name user card blocks unless its logical ref and digest are explicitly supplied in the request |
| AC-5 | Truthful Copilot execution identity | preselected SDK custom agent built from the resolved card; claim-derived session identity; pinned requested model; observed session start, selected agent, assistant model, runtime, and executor retained durably |
| AC-6 | Fail before effects | all closed-input, card, preflight, Git, plan, output-path, and executor checks precede `claimSeatDispatchPacketV1`; no model call occurs unless the claim says `execute_once` |
| AC-7 | Durable lifecycle | claim writes `dispatch.started`; completed/failed/cancelled terminal events and nonterminal interrupted events follow the existing state machine and are read back before return |
| AC-8 | Closed structured result | Fury receives a closed JSON output contract; prose, extra fields, malformed JSON, identity drift, or unsupported verdict fails closed |
| AC-9 | Exact handoff | PASS builds `mission.transition-plan-review.v1`, preserves the validated transition plan, writes both artifacts and closed dispatch evidence durably, and returns their relative paths plus terminal receipt ID |
| AC-10 | Replay safety | each completed PASS/REVISE, failed, cancelled, or nonterminal replay returns its original deterministic disposition without invoking Copilot; conflicting packet returns invalid |
| AC-11 | Drift safety | card, HEAD, mission, plan, runtime, or executor mismatch after claim produces a non-success terminal/recovery result and never a PASS handoff |
| AC-12 | Capability gap | absent SDK runtime, Copilot entitlement/session capability, card resolution, or host observation returns `BLOCKED_ADAPTER_GAP` and fabricates nothing |
| AC-13 | No authority expansion | request/result/receipt state `authority: none`; tools remain read-only; operation cannot implement, publish, merge, deploy, release, or approve |
| AC-14 | Existing consumer proof | real CLI integration test feeds the returned three values to `record-reviewed-transition` and proves exact materialization/already-materialized replay |

## Exact-head corrective revision

Fury reviewed implementation HEAD `70bf5550bd104b96d948f088b88ccbc4593dd6d9` and returned `REVISE`. The correction preserves the original objective and authority-none boundary. It does not authorize a second feature, generic scheduler, publication, merge, deployment, release, or NXT-458 execution.

The seven findings and the integration-discovered identity mismatch are resolved in four tightly coupled packets:

### Packet A — stable execute-once and durable lifecycle (AC-2, AC-7, AC-10)

- Derive the logical operation/packet identity only from immutable mission ID/revision, parent session, subject ID/revision, transition-plan ID/digest, repository ID/workspace/revision, and accountable seat. Timestamp, journal sequence/digest, card precedence, and other live observations remain packet evidence but cannot create a second logical operation.
- Inspect the stable claim identity before invocation. Exact packet bytes replay from durable evidence; different packet bytes for the same logical operation return conflict and never invoke Copilot.
- Extend the existing receipt contract minimally so `dispatch.interrupted` carries closed recovery evidence references and the original disposition code/errors needed for exact replay. Preserve interruption as nonterminal. Failed, cancelled, interrupted, PASS, and REVISE replay their original state/code/errors without reinvocation.
- Preserve mission revision, subject revision, artifact revision, and repository revision in their distinct receipt fields.

### Packet B — confined SDK execution identity (AC-3, AC-5, AC-13)

- Verify the actually loaded `@github/copilot-sdk` package version and retain the observed `session.start.data.producer` runtime/version separately from the configured/requested runtime and executor identities.
- Observe and reject model-change and custom-agent selected/deselected drift across the entire session.
- Deny `managedApprovalRequired` and `requestSandboxBypass`. Canonicalize every requested read path, reject aliases/symlinks, and confine reads to an exact-HEAD repository snapshot. If the SDK does not expose enough information for that proof, return `BLOCKED_ADAPTER_GAP` before claim or invocation. Deny every non-read permission kind.

### Packet C — terminal proof and adversarial output (AC-8, AC-9, AC-11)

- Strictly parse model JSON with duplicate-key rejection before the closed schema validator.
- Revalidate root/branch/HEAD, card, plan, journal, runtime, and executor immediately before terminal append.
- After append, independently reread the completed receipt and all three content-addressed artifacts. Verify their paths, bytes, digests, identities, receipt references, and exact request bindings before returning PASS.
- Add production-executor-level SDK configuration, event, permission, cancellation, and identity tests rather than proving only an injected fake.

### Packet D — reviewed-transition identity compatibility (AC-2, AC-9, AC-14)

- Preserve the receipt's distinct digest-form mission and subject revisions; do not coerce them back to repository Git revisions.
- Extend the reviewed-transition dispatch-identity resolver to validate each identity using its owning contract: repository revision remains a 40-character Git object ID, while mission/subject/artifact revisions accept their existing closed digest identities.
- Prove the real `dispatch-fury-plan-review` → `record-reviewed-transition` CLI handoff and reject cross-field substitution, malformed digest identities, and repository-revision substitution.

## Contract and control flow

### 1. Closed request

Define `shield.copilot-fury-plan-dispatch.request.v1` with only:

- repository root/id/workspace id, branch, planning base, exact HEAD;
- mission ID/revision, subject ID/revision, parent session ID;
- validated transition-plan relative input path and digest;
- resolved-card selection: repository default or explicit user override logical ref plus expected digest;
- requested model/runtime/executor identifiers;
- read-only allowed tools/effects, repair limit, stop conditions, and host-trusted timestamp.

Normalize enumerable data before any asynchronous operation. Reject proxies, accessors, symbols, non-enumerable fields, unknown fields, and aliases. Output paths are host-derived under the fixed mission-scoped `.shield/audit/copilot-fury-plan-dispatch/` evidence subtree; callers cannot choose repository write destinations.

### 2. Card resolution

Resolve the repository card from exact HEAD at `.github/agents/fury.agent.md`, parse it with the existing Copilot card parser, and require the canonical seat ID independently from its display name. Inspect the supported user-card location for same-name shadowing.

The durable identity is:

- `sourceKind`: `repository` or `explicit_user_override`;
- `logicalRef`: repository-relative card ref or stable user-card ref, never the absolute path alone;
- `contentDigest`;
- `repositoryRevision`: exact HEAD for repository cards, otherwise `null`;
- ordered precedence observations explaining every considered source and why the selected source won.

An unrequested user override, ambiguous source, changed bytes, or display-name-only match fails before claim. An explicit override must match both logical ref and digest.

### 3. Execute-once claim

Canonicalize the validated request, transition plan, card identity, mission-journal projection digest/sequence, output contract, and SDK configuration into one packet. Claim it through `claimSeatDispatchPacketV1` with accountable seat `fury` and input evidence refs for the plan/card/request/journal digests.

The claim key is derived from the immutable logical operation coordinates frozen in Packet A, not from mutable packet observations. The complete canonical packet digest is independently bound to that stable claim. A changed timestamp, journal observation, card observation, or other packet byte cannot mint a second receipt for the same operation.

- `execute_once`: proceed.
- exact completed PASS: verify durable plan/review/evidence artifacts and terminal receipt, then return the existing tuple.
- exact completed REVISE, failed, cancelled, or nonterminal claim: return its original durable disposition; do not invoke again in this slice.
- conflict or malformed ledger: fail closed.

### 4. Copilot host invocation

Add a narrow SDK executor interface so contract/durability tests inject a deterministic fake while the production dependency uses pinned `@github/copilot-sdk@1.0.11`.

Create one SDK client in `empty` mode and one session with exactly one locally supplied custom agent named `fury`. Set the claim-generated child session ID as `sessionId`, preselect with `agent: "fury"`, use the resolved card body as its prompt, set `customAgentsLocalOnly`, disable runtime configuration/plugin/skill/MCP/hook discovery, select the requested model explicitly, and configure an exact session-level read-only `availableTools` list plus mutating-tool exclusions. Remove `web` from this v1 operation. Reject unauthorized calls in pre-tool hooks and deny every permission request outside the empty effect allowlist. The task prompt contains only exact plan/repository bindings and the closed output schema.

Register `onEvent` during session creation. Require matching `session.start` session ID and selected model, `session.rpc.agent.getCurrent().agent.name === "fury"`, the current session model, and the final `assistant.message.model`. Reject any model-change event, agent deselection/substitution, unexpected tool/effect request, missing early observation, or executor/session substitution. Do not require or synthesize `subagent.started`; that event belongs to parent-delegated subagents, not this directly preselected active agent.

The permission handler must reject managed-approval and sandbox-bypass requests. It may approve a read only after no-follow canonical confinement proves the path belongs to the exact-HEAD repository snapshot. It denies every other request. The host records the loaded SDK package version and observed session producer/runtime instead of copying configured constants into observed evidence.

### 5. Result and terminalization

Accept a closed Fury result containing only reviewed-artifact identity echoes, verdict, and bounded findings:

- `PASS`; or
- `REVISE` with bounded structured findings and no reviewed-transition handoff.

The host—not Fury—injects every mission, plan, reviewer runtime/model/executor, and repository identity field required by `buildMissionTransitionPlanReviewV1`.

Before lifecycle append, write one closed content-addressed dispatch-evidence artifact containing the normalized packet/card provenance and precedence, SDK package/runtime configuration, mission-journal projection digest/sequence, selected agent/tools/policy decisions, session and model observations, validated model result, and resulting artifact identities. Constrain it and all output artifacts to the fixed mission evidence subtree; use no-follow creation, atomic write/sync/readback, and alias/symlink/hardlink checks. Reference its digest from the receipt so a later session can reconstruct provenance without packet bytes.

Use this exact lifecycle table:

- PASS → `dispatch.completed`, durable evidence plus PASS plan/review artifacts, and the three-value handoff.
- REVISE → `dispatch.completed`, durable REVISE evidence, and no reviewed-transition handoff.
- SDK or output failure → `dispatch.failed`.
- confirmed cancellation → `dispatch.cancelled`.
- uncertain interruption → `dispatch.interrupted` plus `recovery_required`; interruption remains nonterminal.

Interrupted receipt evidence must bind the durable recovery artifact and original code/errors. Replay reads that binding from the receipt rather than scanning for an unreferenced self-identifying artifact.

For PASS, recheck live Git/card/plan/journal identity immediately before terminal append, build and validate the existing review artifact from host-observed identity, persist/read back all evidence, append/read back `dispatch.completed`, then independently reread and validate the receipt plus transition-plan, review, and dispatch-evidence artifacts before returning the consumer tuple. Never convert REVISE into PASS or authority.

## Bounded implementation surface

Expected production paths:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts` — closed contracts, card resolver, execute-once host composition, fixed evidence-path derivation, durable artifact write/readback, and SDK executor seam; export this implementation directly.
- `packages/shield-team-system/src/mission-cli.mts` — add `mission dispatch-fury-plan-review` and concise help/output.
- `packages/shield-team-system/package.json` and `package-lock.json` — pin the Copilot SDK and expose only the deliberate host API.
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs` — focused contract, lifecycle, drift, replay, card precedence, and fault tests.
- `packages/shield-team-system/tests/supervised-cli.test.mjs` — real CLI success/block/replay and handoff into `record-reviewed-transition`.
- `packages/shield-team-system/tests/package-surface.test.mjs` — package/export/help contract.
- `packages/shield-team-system/src/seat-dispatch-receipt-v1.mts` — minimal backward-compatible interrupted-event recovery-evidence and original-disposition binding.
- `packages/shield-team-system/tests/seat-dispatch-receipt-v1.test.mjs` — receipt schema, lifecycle, exact replay, and compatibility coverage for the interruption extension.
- `packages/shield-team-system/tests/seat-dispatch-store.test.mjs` — durable append/readback and conflicting-replay coverage for the extended interrupted event.
- `packages/shield-team-system/src/mission-preparation-host-v1.mts` — preserve distinct repository Git revision and mission/subject/artifact digest identity contracts during reviewed-transition dispatch resolution.
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs` — focused valid/malformed/cross-field identity compatibility and substitution coverage.

If implementation shows that a separate Nx package is required to isolate the optional SDK dependency, stop and return to Fury: do not create a project boundary or broaden the path list implicitly. The smallest current boundary is `@shield/team-system`, which already owns Copilot readiness, mission CLI, dispatch receipts, and transition materialization.

## Required tests

Focused tests must prove behavior rather than mirror helpers:

1. repository Fury card success and exact `record-reviewed-transition` materialization;
2. explicit digest-bound user override success;
3. silent same-name user shadowing rejection before claim;
4. missing SDK/Copilot capability yields `BLOCKED_ADAPTER_GAP` with no receipt/artifact;
5. prose-only, malformed JSON, extra field, REVISE, wrong seat echo, wrong model/runtime/executor/session, model change, agent deselection, and mismatched plan output;
6. lifecycle-table coverage for PASS, REVISE, failed, cancelled, interrupted, exact duplicate retry, conflicting retry, and every existing durable state without reinvocation;
7. card, HEAD, branch, root, plan, mission, runtime, and executor drift at each pre-effect/readback boundary;
8. fixed evidence-subtree confinement, arbitrary caller path rejection, output symlink/alias/hardlink/replacement, partial write, sync/close failure, terminal append failure, and final readback mismatch;
9. no Copilot invocation before a durable execute-once claim, empty-mode/discovery isolation, exact read-only tools, pre-tool rejection, and no unauthorized effect after the final policy decision;
10. package build, type surface, CLI help, and focused test targets through Nx.

The corrective tests must additionally prove stable-operation conflicting retries after journal/card/timestamp drift; managed or sandbox-bypass read denial; exact-HEAD path confinement; loaded SDK and session-producer observation; transient agent deselection; duplicate JSON-key rejection; interruption evidence/code replay from the receipt; pre-terminal drift; and final replacement/readback faults for every returned artifact and the receipt.

Packet D must prove the exact CLI handoff succeeds with digest-form mission and subject revisions while repository revision remains Git-bound, and that malformed or substituted identities fail closed.

Validation uses Nx affected/focused targets against the exact base and HEAD and trusts valid Nx cache hits. May must produce one real focused execution for changed behavior. Mack independently evaluates the exact inputs, graph, cache provenance, and outputs; it reruns uncached targets only for a concrete cache or risk concern. Routine duplicated full-suite uncached execution is prohibited.

## Stop conditions

Stop and return to Fury before implementation if:

- the pinned Copilot SDK cannot preselect the supplied custom agent or expose enough lifecycle/model identity for attribution;
- the SDK cannot enforce the read-only tool/effect boundary;
- the existing receipt lifecycle cannot represent a truthful terminal/recovery outcome;
- the existing transition review contract cannot be built without weakening its closed identity;
- a new authority type, schema-9 Fury authority projection, generic scheduler, VS Code extension, or separate Nx package becomes necessary;
- any required path falls outside the bounded surface above.

## Proving disposition

After exact-head Mack validation and Fury conformance PASS, use the preserved NXT-458 mission only to prove that the new operation creates authentic reviewed-transition evidence. Do not implement NXT-458 or request a new PIN before its actual implementation boundary.
