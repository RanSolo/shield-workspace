# Issue #320 — governed seat-dispatch startup readiness, Slice 1

## Frozen identity

- Issue: `#320`
- Repository: `RanSolo/shield-workspace`
- Planning base: `ebf8dfe65bb83315e8789b46bfd3aa0703ab16ea`
- Exact plan commit and plan-content SHA-256 are separate immutable review-packet bindings supplied to Fury; neither is represented by the planning base.
- Authority during planning and technical review: `none`
- Objective: make the already-merged GitHub Copilot Fury dispatch capability observable before mission authority by adding one shared, effect-free capability probe to teammate preflight and Doctor.

This slice does not authorize implementation, dispatch a model, create mission authority, mutate a journal or receipt, resume NXT-458, publish, merge, deploy, release, or claim that all of #320 is complete.

## Verified baseline

- `copilot-fury-plan-dispatch-v1.mts` owns the production SDK executor and already performs a pre-effect check for the pinned SDK version, required exports, and the closed stdio transport projection.
- `copilot-teammate-readiness-v1.mts` verifies exact-HEAD Copilot agent cards and observes VS Code plus the Copilot extension, but it does not test whether the governed Fury executor can be constructed.
- `shield doctor` validates configuration and configured publication adapters only. It cannot presently report the governed Copilot seat-dispatch capability.
- `tools/teammate-launch.mjs` requires the Copilot teammate preflight to return `ready_for_host_confirmation` and enforces a closed ordered machine-check set. The launcher and its tests must admit the new row together. Its current preparation order may already create a disposable checkout and run install/build; an unavailable capability must stop before readiness-receipt publication, host handoff, and mission authority.
- The later transition/materialization boundary already validates dispatch evidence. Hardening only that boundary would still discover an unavailable adapter after mission authority and would not satisfy this slice.

## Acceptance criteria

| ID | Required behavior | Exact evidence |
| --- | --- | --- |
| AC-1 | One authority-none capability probe validates the actually loaded pinned `@github/copilot-sdk`, required constructor/transport exports, safe stdio projection, production-equivalent Fury card precedence, and the production dispatch-receipt path without starting the SDK, creating a session, invoking a model, writing a receipt, or changing repository state. | Focused tests inject each closed failure reason and ready dependencies; spies prove only permitted metadata reads and `RuntimeConnection.forStdio()` occur. |
| AC-2 | `shield teammate preflight --host github-copilot` and the supported teammate launcher admit the same ordered capability row. Unavailable capability returns `action_required` and stops before readiness-receipt publication, host handoff, and mission authority; ready capability preserves `ready_for_host_confirmation`. | Contract, CLI, and mandatory root launcher tests prove exact ordering, complete checks, failure precedence, non-zero exit, redaction, no receipt/handoff/authority calls on failure, and successful ready-path acceptance. Disposable checkout/install/build preparation is explicitly permitted before this check. |
| AC-3 | `shield doctor --host github-copilot` composes a separate host-selected report from the same capability result and actionable next step, while ordinary `shield doctor`, `evaluateDoctor`, and `DoctorReportV2` remain byte/schema compatible. | Doctor evaluator/CLI tests prove selected-host failure/success/drift, ordinary Doctor compatibility, and no authority or filesystem mutation. |

## Design

### Shared capability contract

Expose a narrow immutable result from the Copilot Fury adapter module (or a new file only if Fury determines that avoids a dependency cycle):

- contract/version and `authority: "none"`;
- disposition `ready | unavailable`;
- one closed reason code and matching closed next action;
- observed SDK package/version and configured target runtime/executor identity when ready;
- complete production card identity: source kind, logical ref, exact-HEAD digest, repository revision, and ordered precedence observations;
- the fixed dispatch-receipt logical path and safety classification, never a secret or journal body;
- before/after repository identity proving the result remained bound to one root, branch, HEAD, clean state, and card.

The probe accepts an absolute repository root and exact expected HEAD. It reuses the production repository-default Fury card resolver, including ambient user-card precedence and shadowing rejection, and the production executor's SDK/transport checks rather than copying approximations. An explicit user-card override is not a startup default and cannot make this probe ready. Shared checkers must remain in the listed production modules; no unnamed source module is authorized.

Permitted operations are limited to Git/repository observations, agent-card and package-metadata reads, no-follow receipt-path metadata inspection, dynamic SDK module load, and `RuntimeConnection.forStdio()` projection construction. Forbidden operations include SDK client construction, client start, model listing, session creation, model invocation, permission requests, filesystem writes, journal or receipt parsing, and authority creation.

The closed failure precedence is:

1. `invalid_input`;
2. `repository_unavailable`;
3. `expected_head_mismatch`;
4. `workspace_dirty`;
5. `fury_card_unavailable`;
6. `fury_card_shadowed`;
7. `dispatch_receipt_path_unsafe`;
8. `copilot_sdk_unavailable`;
9. `copilot_sdk_version_mismatch`;
10. `copilot_sdk_exports_invalid`;
11. `copilot_stdio_projection_unsafe`;
12. `repository_drift`;
13. `ready`.

Each reason has one constant next action. Tests must prove precedence when multiple failures coexist.

The receipt path is not configurable: it is the existing `.shield/dispatch-receipts.jsonl`; its lock is the store's existing fixed sibling lock path. Extract one read-only path-resolution primitive from `seat-dispatch-store.mts` and use it both in production receipt operations and this probe. Do not parse or create the ledger. This slice does not pretend a read-only probe can guarantee a future write.

The structural classification is closed:

| Observed state | Result |
| --- | --- |
| `.shield` absent while the canonical repository root is stable and has host-observed write/search permission for future authorized creation | ready; do not create it during probing |
| `.shield` symlinked, aliased outside the canonical root, not a directory, or inaccessible | unavailable: `dispatch_receipt_path_unsafe` |
| canonical `.shield` directory lacks host-observed write/search permission | unavailable: `dispatch_receipt_path_unsafe` |
| receipt log absent with canonical safe `.shield`; lock absent | ready |
| receipt log is one canonical regular file with link count one; lock absent | ready |
| receipt log is symlink, non-regular, multiply linked, replaced during observation, or aliases another object | unavailable: `dispatch_receipt_path_unsafe` |
| lock exists in any form, including a regular file | unavailable: `dispatch_receipt_path_unsafe` |
| `ENOENT` while observing optional log or lock after stable parent observation | treat that optional object as absent, then reobserve the parent before returning |
| any other filesystem error, or parent/root drift between observations | unavailable: `dispatch_receipt_path_unsafe` (repository identity drift remains `repository_drift` when that stronger check applies) |

### Teammate preflight

Add one ordered `platform.fury_dispatch` machine check after exact agent-card validation. Update the launcher's closed expected set in the same commit. Preserve the complete check list and repository-stability re-observation. A failed capability probe yields `action_required`, its capability-specific reason, and one rerun instruction. Publication projection continues to redact the absolute root.

### Doctor

Add optional `--host github-copilot` to Doctor. Preserve synchronous `evaluateDoctor`, `DoctorReportV2`, and no-host JSON/human output exactly. The selected-host CLI path captures canonical repository identity, runs the shared probe against that exact HEAD, reobserves identity, and returns a separate closed host-selected composition report. Drift has the stable `repository_drift` result. Invalid hosts fail as CLI usage errors before probing.

Doctor must not conflate configured GitHub/Atlassian communication adapters with the GitHub Copilot seat runtime. The new check is explicitly a host capability, not a new authority or communication-adapter admission.

## Bounded paths

Expected production paths:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`
- `packages/shield-team-system/src/copilot-teammate-readiness-v1.mts`
- `packages/shield-team-system/src/seat-dispatch-store.mts`
- `packages/shield-team-system/src/config.mts`
- `packages/shield-team-system/src/cli.mts`
- `tools/teammate-launch.mjs`

Expected tests:

- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-teammate-readiness-v1.test.mjs`
- `packages/shield-team-system/tests/config.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
- `tools/teammate-launch.test.mjs`

No package, lockfile, agent-card, mission-journal, authority, dispatch receipt, or Nx project-boundary change is expected.

## Validation

- Run the focused changed tests through the existing `@shield/team-system` Nx target with cache enabled.
- Run `node --test tools/teammate-launch.test.mjs` explicitly because it is outside the Team System test target.
- Run `nx affected` build/test from the frozen base to implementation HEAD with cache enabled.
- Run `git diff --check` and verify the base-to-HEAD path allowlist.
- Mack independently validates exact HEAD and may trust valid Nx cache hits; an uncached rerun requires a concrete cache or risk concern.

## Stop conditions

Return to Fury before implementation if:

- the probe must start Copilot, create a session, invoke a model, or write durable state;
- proving card provenance or receipt-path safety requires weakening exact-HEAD/no-follow checks;
- Doctor integration would change ordinary no-host behavior or conflate host runtime with communication adapters;
- mission-authority schema, safe journal reconciliation, May/Mack/Fury execution composition, publication, branch convergence, or a new Nx package is required.

Those remaining #320 capabilities belong to subsequent bounded slices after this startup signal is proven. The next slice must bind this readiness result into Wheels Off/Epic Wheels Up admission and safe resume; it must not be silently added here.
