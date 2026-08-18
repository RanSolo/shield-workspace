# Issue #320 — governed seat-dispatch startup readiness, Slice 1

## Frozen identity

- Issue: `#320`
- Repository: `RanSolo/shield-workspace`
- Planning base and exact reviewed revision: `ebf8dfe65bb83315e8789b46bfd3aa0703ab16ea`
- Authority during planning and technical review: `none`
- Objective: make the already-merged GitHub Copilot Fury dispatch capability observable before mission authority by adding one shared, effect-free capability probe to teammate preflight and Doctor.

This slice does not authorize implementation, dispatch a model, create mission authority, mutate a journal or receipt, resume NXT-458, publish, merge, deploy, release, or claim that all of #320 is complete.

## Verified baseline

- `copilot-fury-plan-dispatch-v1.mts` owns the production SDK executor and already performs a pre-effect check for the pinned SDK version, required exports, and the closed stdio transport projection.
- `copilot-teammate-readiness-v1.mts` verifies exact-HEAD Copilot agent cards and observes VS Code plus the Copilot extension, but it does not test whether the governed Fury executor can be constructed.
- `shield doctor` validates configuration and configured publication adapters only. It cannot presently report the governed Copilot seat-dispatch capability.
- `tools/teammate-launch.mjs` requires the Copilot teammate preflight to return `ready_for_host_confirmation`; therefore a new failing machine check prevents the supported teammate startup path from proceeding.
- The later transition/materialization boundary already validates dispatch evidence. Hardening only that boundary would still discover an unavailable adapter after mission authority and would not satisfy this slice.

## Acceptance criteria

| ID | Required behavior | Exact evidence |
| --- | --- | --- |
| AC-1 | One authority-none capability probe validates the actually loaded pinned `@github/copilot-sdk`, required constructor/transport exports, safe stdio projection, canonical Fury card provenance, and structurally safe durable dispatch-receipt location without starting the SDK, creating a session, invoking a model, writing a receipt, or changing repository state. | Focused tests inject absent, malformed, wrong-version, unsafe-transport, invalid-card, unsafe-receipt-path, and ready dependencies and prove zero execution/effect calls. |
| AC-2 | `shield teammate preflight --host github-copilot` includes the capability result as an ordered machine check and cannot return `ready_for_host_confirmation` when it is unavailable. It reports all machine checks while preserving deterministic first-failure precedence. | Contract and CLI tests prove exact reason codes, complete ordered checks, non-zero exit, publication redaction, and the unchanged ready path. |
| AC-3 | `shield doctor --host github-copilot` reports the same capability result and actionable next step, while ordinary `shield doctor` remains backward compatible and does not imply Copilot is required for repositories that did not request that host. | Doctor evaluator/CLI tests prove host-selected failure and success, ordinary Doctor compatibility, and no authority or filesystem mutation. |

## Design

### Shared capability contract

Expose a narrow immutable result from the Copilot Fury adapter module (or a new file only if Fury determines that avoids a dependency cycle):

- contract/version and `authority: "none"`;
- disposition `ready | unavailable`;
- stable reason code and actionable next step;
- loaded SDK package/version and runtime/executor identity when ready;
- Fury card logical ref, exact-HEAD digest, and repository revision;
- dispatch-receipt logical path classification, never a secret or journal body.

The probe accepts an absolute repository root and exact expected HEAD. It reuses the existing strict card parser and the production executor's SDK/transport checks rather than copying a second approximation. Extract a shared pure/internal checker if needed. It may inspect existing filesystem metadata with no-follow operations, but it must not create directories, files, SDK clients, sessions, receipts, or authority.

The receipt-path check is structural and fail-closed: the configured/default dispatch receipt path and each existing ancestor must stay inside the repository's `.shield` state boundary, must not traverse symlinks or non-directories, and must not alias an unsafe object. This slice does not pretend that a read-only probe can guarantee a future write.

### Teammate preflight

Add one ordered `platform.fury_dispatch` machine check after exact agent-card validation and before host confirmations. Preserve the current complete check list and repository-stability re-observation. A failed capability probe yields `action_required`, a stable capability-specific reason, and a single rerun instruction. Publication projection continues to redact the absolute root.

### Doctor

Add optional `--host github-copilot` to Doctor. Only the selected-host form runs the asynchronous shared probe and appends a host-capability check to the Doctor report. The no-host command preserves its current schema and behavior. Invalid hosts fail as CLI usage errors before probing.

Doctor must not conflate configured GitHub/Atlassian communication adapters with the GitHub Copilot seat runtime. The new check is explicitly a host capability, not a new authority or communication-adapter admission.

## Bounded paths

Expected production paths:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`
- `packages/shield-team-system/src/copilot-teammate-readiness-v1.mts`
- `packages/shield-team-system/src/config.mts`
- `packages/shield-team-system/src/cli.mts`

Expected tests:

- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-teammate-readiness-v1.test.mjs`
- `packages/shield-team-system/tests/config.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `tools/teammate-launch.test.mjs` only if its closed expected machine-check set requires adjustment.

No package, lockfile, agent-card, mission-journal, authority, dispatch receipt, or Nx project-boundary change is expected.

## Validation

- Run the focused changed tests through the existing `@shield/team-system` Nx target with cache enabled.
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
