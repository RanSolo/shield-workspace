# Issue #199 — Training Wheels Off fail-closed correction plan

## Review identity

- Mission: `mission:issue-199`
- Subject: `github:RanSolo/shield-workspace/issue/199`
- Base revision: `d71b00c55a5365d1d6aedd00e77327fb852bf705`
- Branch: `agent/issue-199-training-wheels-fail-closed`
- Implementation seat: May
- Independent validation seat: Mack

This mission corrects only the specialist-dispatch authorization regression
described by issue #199. It does not create an authority/evidence class, accept
caller assertions as authority, change publication authority, mark a pull
request ready, merge, deploy, release, or exercise an external effect.

Mack is not listed in the profile-aware brief because the V0.3 dispatchable-role
schema rejects `mack` as a brief participant. Mack remains the independent
post-implementation validator under the repository workflow. Fitz remains a
declared human participant, but this mission's `standard@1` profile does not
invent or require a Fitz decision beyond its configured evidence gates.

## Verified defect and adjacent integration hazard

`canDispatchSpecialists()` currently returns `true` when Mission Brief approval
is valid but both supported post-plan dispatch paths are absent. The exact
defect is:

```js
if (input.trainingWheelsOff !== true) return true;
```

The policy correction is `return false`.

Delivery Workspace currently calls that policy with only caller-provided
`missionState` and `approvalSource`, before it publishes/verifies the draft
workspace and before it evaluates durable Fury evidence. Those two strings do
not prove explicit Coulson dispatch authority or complete Training Wheels Off
eligibility. Leaving the call in place would also make the one-line fix suppress
the early draft Mission Workspace promised by issue #70.

No existing Delivery Workspace input proves current signed mission authority,
exact mission/subject/revision, non-revoked implementation authority, current
runtime binding, all Training Wheels Off gates, and evaluated journal sequence.
Issue #141 owns the durable typed authority projection needed to reopen that
positive integration safely. This P0 correction therefore fails closed rather
than introducing caller-asserted replacement evidence.

## Frozen implementation

### 1. Correct the policy branch

In `contracts/mission-policy.mjs`, change the absent/non-true Training Wheels
Off branch to return `false`. Preserve the existing ordering:

1. exact approved mission and Coulson Mission Brief source;
2. explicit Coulson specialist-dispatch approval;
3. exact `trainingWheelsOff: true`;
4. every existing positive and negative bounded gate.

Do not loosen coercion, accept aliases, add defaults, or alter any gate.

### 2. Preserve early workspace publication; hold final dispatch

In `github/delivery-workspace.mjs`, remove the pre-publication policy check.
Keep publication authorization replay, exact draft creation/update/readback,
and durable Fury evidence evaluation in their current order.

If Fury evidence is not eligible, return the existing `workspace_ready` result.
This preserves the legacy first-call publication behavior without claiming
specialist dispatch readiness.

If Fury evidence becomes eligible, evaluate `canDispatchSpecialists()`
immediately before the sole `dispatch_ready` return using only the current
Delivery Workspace fields. Because those fields contain neither explicit
Coulson dispatch evidence nor complete Training Wheels Off evidence, the result
must be `blocked` with `specialist_dispatch_not_approved`. No additional effect
may occur after that decision.

Do not add optional policy flags, loader callbacks, signatures, projections,
or raw evidence objects in this mission. A later #141 child must bind a fresh
replayed authority projection to mission, subject, mission revision,
repository, branch, artifact revision, runtime binding, and evaluated journal
sequence before Delivery Workspace can regain a positive `dispatch_ready`
path. Until then, fail closed.

### 3. Tests

In policy tests:

- add explicit denial cases for absent `trainingWheelsOff`, `false`, `null`,
  strings, numbers, objects, and arrays;
- preserve the explicit Coulson happy path;
- preserve the exact eligible Training Wheels Off happy path;
- preserve denial for every individual existing gate failure;
- preserve hostile object/accessor/proxy fail-closed behavior.

In Delivery Workspace tests:

- preserve early verified draft publication as `workspace_ready` while Fury is
  pending with the legacy input shape;
- prove an exact Fury PASS with no durable dispatch evidence returns `blocked`
  as `specialist_dispatch_not_approved` rather than `dispatch_ready`;
- prove no command/effect occurs after the final dispatch-policy decision;
- prove an unknown caller-supplied `trainingWheelsOff: false` field remains
  rejected by the closed input shape before effects;
- preserve schema-8 and schema-9 draft publication, publication failures,
  receipt checks, and Fury evidence semantics.

## Exact writable paths

- `packages/shield-team-system/contracts/mission-policy.mjs`
- `packages/shield-team-system/github/delivery-workspace.mjs`
- `packages/shield-team-system/tests/mission-policy.test.mjs`
- `packages/shield-team-system/tests/delivery-workspace.test.mjs`

No public declaration, mission-journal, signature, CLI, publication-gate,
publication-authority, adapter, PR effector, Fury evidence, runtime-binding,
May dispatch, fixture, or unrelated documentation changes are authorized. If a
positive Delivery Workspace dispatch path is required for this PR, May must
stop: that requires the separately reviewed durable authority projection owned
by #141.

## Validation

May must run:

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/mission-policy.test.mjs
node --test packages/shield-team-system/tests/delivery-workspace.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

Mack must rerun the focused tests and full package suite against the exact
implementation revision. Fury then performs exact-revision conformance review.
