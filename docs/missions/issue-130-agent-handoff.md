# Issue #130 Mission Communication File

This is the Hill-owned, file-backed communication artifact for Mission #130.
It is the mission file supplied to local seats until a durable runtime context
and verified draft PR Mission Workspace exist.

It is not an authority source, journal, dispatch receipt, or substitute for the
GitHub review surface. Hill updates accepted mission facts and current route;
specialists return bounded findings rather than rewriting this file directly.

## Binding

- Repository: `RanSolo/shield-workspace`
- Issue: #130
- Branch: `codex/issue-130-canonical-mission-runtime`
- Mission base: `68defc3fed912dda663d00438ce68c249fe39d5c`
- Mission Brief:
  `docs/missions/issue-130-canonical-mission-runtime.md`
- Hill Plan: `docs/missions/issue-130-hill-plan.md`
- Intake API audit:
  `docs/missions/issue-130-mission-intake-api-audit.md`
- Proposed intake v1 plan:
  `docs/missions/issue-130-mission-intake-v1-plan.md`
- Fury intake v1 review:
  `docs/missions/issue-130-fury-intake-v1-review.md`
- Shared runtime instructions:
  `docs/missions/issue-130-shared-runtime-instructions.md`

The trusted host must supply the current exact repository revision at each
dispatch. This file must not be used to infer that mutable value.

## Human direction

Coulson instructed the team to begin Mission #130 "meta style": create the
smallest executable `missionIntake(...)` seam, then use it to intake Issue #130
itself.

This direction was supplied through the active human conversation. It is not
signed journal evidence because the runtime intake path does not yet exist.
That limitation must remain visible.

## Current objective

Inventory all existing package functions that may participate in mission
intake. Freeze a closed intake request/result that composes those functions
without granting authority, dispatching a seat, invoking tools, or publishing
externally.

## Current route

```text
manual bootstrap intake
→ package API candidate audit
→ missionIntake v1 contract
→ advisory Fury review: REVISE
→ Hill contract corrections
→ Fury re-review
→ bounded implementation
→ self-intake of Issue #130
→ report runtime participation and remaining workarounds
→ stop at the next human gate
```

## Communication surfaces

### File-backed mission communication

This file carries current local seat context and route. It may be passed to a
local runtime only with:

- the shared runtime instructions;
- an explicit SHIELD context block;
- the exact seat prompt;
- current repository/revision evidence;
- explicit tools and output contract.

### Draft PR Mission Workspace

After the Mission Brief and architecture plan are committed and the required
approval/gate conditions are satisfied, the draft PR becomes the visible human
communication and review surface. The current mission has no verified draft PR
Mission Workspace yet.

### Journaled communication

External review publication now requires journal v8 exact signed publication
authority, a publication-bound communication request, full replay before the
effect, adapter delivery, and correlated result evidence. The current mission
has no initialized S.H.I.E.L.D. journal and must not claim journaled
communication or review-publication authority.

## Runtime participation ledger

| Action | Classification | Durable evidence |
| --- | --- | --- |
| Issue #130 creation | human-directed plus direct GitHub CLI | GitHub Issue #130 |
| Mission branch creation | human-directed plus direct Git | local Git branch |
| Mission Brief and Hill Plan drafting | prompt-directed bootstrap workaround | repository files, not yet committed |
| Intake API candidate audit | prompt-directed bootstrap workaround using direct repository reads | repository audit file |
| Shared runtime instruction preservation | human-directed bootstrap input | repository file |
| PR #129 base integration | framework code merged by human; incorporated through direct Git | merge `68defc3fed912dda663d00438ce68c249fe39d5c` |
| `missionIntake(...)` execution | not yet available | none |
| SHIELD journal initialization | blocked: repository not initialized | none |
| Daisy or May runtime dispatch | not performed | none |
| Fury architecture verdict | advisory Fury review through direct host subagent dispatch/await; not a formal journaled gate | `docs/missions/issue-130-fury-intake-v1-review.md` |
| Draft PR Mission Workspace publication | not performed | none |

## Breadcrumb log

### 2026-07-29T13:46:50Z — Bootstrap mission authorized

- Human direction: begin Mission #130 "meta style."
- Route: implement `missionIntake(...)` first, then use it to intake #130.
- Enforcement: human-directed session instruction.
- Runtime proof: none; no intake function or journal existed.

### 2026-07-29T13:48:52Z — Review-publication runtime merged

- PR #129 merged as `68defc3fed912dda663d00438ce68c249fe39d5c`.
- Mission #130 branch rebased onto that exact merge.
- Intake audit expanded to include journal v8 signed publication authority,
  publication-bound communication requests, and exact result evidence.
- Enforcement: direct Git/GitHub bootstrap operations.
- Runtime proof: merged package behavior exists; Mission #130 did not execute
  it.

### Intake API inventory — completed

- Existing functions were classified as intake composition, conditional
  helpers, post-intake behavior, or explicit exclusions.
- Major gaps found: recommendation versus activation, seats versus human
  gates, pre-authorization persistence, issue identity, and repository
  bootstrap configuration.
- Enforcement: repository evidence plus direct session reasoning.
- Runtime proof: none.

### Runtime context and communications — preserved

- Human-supplied shared runtime instructions were preserved verbatim.
- This Hill-owned mission communication file was created.
- Mission Brief, communication file, journal state, Mission Workspace, and
  adapter communication were separated explicitly.
- Local May/Daisy health was recorded as
  `human_reported_unverified`.
- Enforcement: direct file edits.
- Runtime proof: none.

### `missionIntake v1` plan — proposed

- Public candidate: `@shield/team-system/intake`.
- First slice: pure, closed, non-authoritative candidate construction.
- Reused package APIs: configuration validation, risk classification,
  canonical brief creation/validation, and evidence requirements.
- No CLI, journal write, dispatch, model, tool, adapter, or publication effect.
- Current gate: Fury architecture review.
- Enforcement: plan artifact only.
- Runtime proof: none until the public function is implemented and dogfooded.

### Fury architecture review — `REVISE`

- Reviewed exact revision:
  `32dbb4e90211f98efe9c56e397c03e0b658a19fe`.
- Dispatch and await mechanism: direct host subagent tools.
- Package runtime proof: none; neither `dispatchFury()` nor a canonical mission
  orchestration function currently exists.
- Required corrections: preserve repository/issue/configuration provenance;
  bind artifacts to HEAD; remove Mack from the v1 participant fixture; validate
  structure before risk classification; provision repository/journal before
  claiming an authoritative human wait; classify intake as milestone one; and
  freeze the public symbol.
- Current route: Hill revises the exact contract, commits it, and returns the
  new revision to Fury.

### Fury architecture re-review — `REVISE`

- Reviewed exact revision:
  `39205352db25fcc342dfbd716fd586ea8137b35b`.
- Most first-review findings were satisfied.
- Residual findings: bind repository configuration to HEAD, select an
  implementable risk-error classification, and freeze exact input bounds.
- Hill correction: stale repository configuration maps to
  `REPOSITORY_BINDING_MISMATCH`; malformed risk data maps through the existing
  brief validator to `INVALID_BRIEF_INPUT`; exact string and collection limits
  are frozen.
- Current route: commit the narrow corrections and return the exact revision
  to Fury again.

## Reported environment observation

The human operator reported that local May and Daisy were healthy on the prior
night. This is `human_reported_unverified` historical context. A fresh
capability probe, mission binding, dispatch receipt, and result receipt are
required before either runtime can be credited with mission participation.

## Current stop condition

Do not implement `missionIntake(...)` until the contract identifies:

- every reused package function;
- every host-supplied assertion;
- candidate versus authoritative persistence;
- recommendation versus mode activation;
- dispatchable seats versus human-gate stops;
- the exact file-backed and external communication artifacts;
- fail-closed behavior for missing repository configuration and bindings.
