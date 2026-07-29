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
- Mission base: `1316f317fe9aaf6de4a94a5055f7104282e2779b`
- Mission Brief:
  `docs/missions/issue-130-canonical-mission-runtime.md`
- Hill Plan: `docs/missions/issue-130-hill-plan.md`
- Intake API audit:
  `docs/missions/issue-130-mission-intake-api-audit.md`
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
→ Fury architecture gate
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

External publication requires an authoritative journal communication request,
adapter delivery, and correlated result evidence. The current mission has no
initialized S.H.I.E.L.D. journal and must not claim journaled communication.

## Runtime participation ledger

| Action | Classification | Durable evidence |
| --- | --- | --- |
| Issue #130 creation | human-directed plus direct GitHub CLI | GitHub Issue #130 |
| Mission branch creation | human-directed plus direct Git | local Git branch |
| Mission Brief and Hill Plan drafting | prompt-directed bootstrap workaround | repository files, not yet committed |
| Intake API candidate audit | prompt-directed bootstrap workaround using direct repository reads | repository audit file |
| Shared runtime instruction preservation | human-directed bootstrap input | repository file |
| `missionIntake(...)` execution | not yet available | none |
| SHIELD journal initialization | blocked: repository not initialized | none |
| Daisy or May runtime dispatch | not performed | none |
| Fury architecture verdict | not performed | none |
| Draft PR Mission Workspace publication | not performed | none |

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
