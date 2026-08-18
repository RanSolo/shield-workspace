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
| AC-5 | Truthful Copilot execution identity | preselected SDK custom agent built from the resolved card; pinned requested model; observed SDK/session lifecycle, model, runtime, executor, task, and session identity retained as evidence |
| AC-6 | Fail before effects | all closed-input, card, preflight, Git, plan, output-path, and executor checks precede `claimSeatDispatchPacketV1`; no model call occurs unless the claim says `execute_once` |
| AC-7 | Durable lifecycle | claim writes `dispatch.started`; exact terminal append writes completed, failed, interrupted, or cancelled and is read back before return |
| AC-8 | Closed structured result | Fury receives a closed JSON output contract; prose, extra fields, malformed JSON, identity drift, or unsupported verdict fails closed |
| AC-9 | Exact handoff | PASS builds `mission.transition-plan-review.v1`, preserves the validated transition plan, writes both artifacts durably, and returns their relative paths plus terminal receipt ID |
| AC-10 | Replay safety | identical completed replay returns the same tuple without invoking Copilot; started/nonterminal replay returns actionable recovery without invoking again; conflicting packet returns invalid |
| AC-11 | Drift safety | card, HEAD, mission, plan, runtime, or executor mismatch after claim produces a non-success terminal/recovery result and never a PASS handoff |
| AC-12 | Capability gap | absent SDK runtime, Copilot entitlement/session capability, card resolution, or host observation returns `BLOCKED_ADAPTER_GAP` and fabricates nothing |
| AC-13 | No authority expansion | request/result/receipt state `authority: none`; tools remain read-only; operation cannot implement, publish, merge, deploy, release, or approve |
| AC-14 | Existing consumer proof | real CLI integration test feeds the returned three values to `record-reviewed-transition` and proves exact materialization/already-materialized replay |

## Contract and control flow

### 1. Closed request

Define `shield.copilot-fury-plan-dispatch.request.v1` with only:

- repository root/id/workspace id, branch, planning base, exact HEAD;
- mission ID/revision, subject ID/revision, parent session ID;
- validated transition-plan relative input path and digest;
- exact output relative paths for the preserved plan and Fury review;
- resolved-card selection: repository default or explicit user override logical ref plus expected digest;
- requested model/runtime/executor identifiers;
- read-only allowed tools/effects, repair limit, stop conditions, and host-trusted timestamp.

Normalize enumerable data before any asynchronous operation. Reject proxies, accessors, symbols, non-enumerable fields, unknown fields, aliases, paths outside the canonical root, and output paths that already contain conflicting bytes.

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

Canonicalize the validated request, transition plan, card identity, output contract, and SDK configuration into one packet. Claim it through `claimSeatDispatchPacketV1` with accountable seat `fury` and input evidence refs for the plan/card/request digests.

- `execute_once`: proceed.
- exact completed claim: verify durable artifacts and terminal receipt, then return the existing tuple.
- exact nonterminal claim: return `recovery_required`; do not invoke again in this slice.
- conflict or malformed ledger: fail closed.

### 4. Copilot host invocation

Add a narrow SDK executor interface so contract/durability tests inject a deterministic fake while the production dependency uses pinned `@github/copilot-sdk@1.0.11`.

Create one session with exactly one supplied custom agent named `fury`, preselect it with `agent: "fury"`, use the resolved card body as its prompt, retain the card's read-only tool restrictions, select the requested model explicitly, and deny any permission request outside the empty effect allowlist. The task prompt contains only the exact plan/repository bindings and the closed output schema.

Capture SDK lifecycle/session evidence. A missing observation, selected agent other than canonical `fury`, model mismatch, unexpected tool/effect request, or executor/session substitution is not attributable success.

### 5. Result and terminalization

Accept a closed Fury result with either:

- `PASS` and the exact fields required to call `buildMissionTransitionPlanReviewV1`; or
- `REVISE` with bounded structured findings and no reviewed-transition handoff.

For PASS, recheck live Git/card/plan identity, build and validate the existing review artifact, atomically persist the exact validated plan and review, sync/read back both, append `dispatch.completed` with their evidence refs, replay/read back the terminal receipt, and return the three consumer values. For REVISE, malformed output, interruption, cancellation, SDK failure, or post-claim drift, append the matching non-success terminal event when its identity remains safely known; otherwise return `recovery_required`. Never convert REVISE into PASS or authority.

## Bounded implementation surface

Expected production paths:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts` — closed contracts, card resolver, execute-once host composition, durable artifact write/readback, and SDK executor seam.
- `packages/shield-team-system/src/mission-cli.mts` — add `mission dispatch-fury-plan-review` and concise help/output.
- `packages/shield-team-system/src/copilot-fury-plan-dispatch.mts` — deliberate public facade if required by package export conventions.
- `packages/shield-team-system/package.json` and `package-lock.json` — pin the Copilot SDK and expose only the deliberate host API.
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs` — focused contract, lifecycle, drift, replay, card precedence, and fault tests.
- `packages/shield-team-system/tests/supervised-cli.test.mjs` — real CLI success/block/replay and handoff into `record-reviewed-transition`.
- `packages/shield-team-system/tests/package-surface.test.mjs` — package/export/help contract.

If implementation shows that a separate Nx package is required to isolate the optional SDK dependency, stop and return to Fury: do not create a project boundary or broaden the path list implicitly. The smallest current boundary is `@shield/team-system`, which already owns Copilot readiness, mission CLI, dispatch receipts, and transition materialization.

## Required tests

Focused tests must prove behavior rather than mirror helpers:

1. repository Fury card success and exact `record-reviewed-transition` materialization;
2. explicit digest-bound user override success;
3. silent same-name user shadowing rejection before claim;
4. missing SDK/Copilot capability yields `BLOCKED_ADAPTER_GAP` with no receipt/artifact;
5. prose-only, malformed JSON, extra field, REVISE, wrong seat, wrong model/runtime/executor/session, and mismatched plan output;
6. interruption after claim, exact duplicate retry, conflicting retry, and existing nonterminal receipt;
7. card, HEAD, branch, root, plan, mission, runtime, and executor drift at each pre-effect/readback boundary;
8. output symlink/alias/replacement, partial write, sync/close failure, terminal append failure, and final readback mismatch;
9. no Copilot invocation before a durable execute-once claim and no unauthorized tool/effect after the final policy decision;
10. package build, type surface, CLI help, and focused test targets through Nx.

Full `@shield/team-system` validation is required because the command extends the mission CLI and receipt/materialization contracts. Use uncached focused evidence first; use Nx affected/full targets according to the resulting graph.

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
