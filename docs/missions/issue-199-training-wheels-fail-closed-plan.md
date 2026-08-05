# Issue #199 — Training Wheels Off fail-closed correction plan

## Review identity

- Mission: `mission:issue-199`
- Subject: `github:RanSolo/shield-workspace/issue/199`
- Base revision: `d71b00c55a5365d1d6aedd00e77327fb852bf705`
- Branch: `agent/issue-199-training-wheels-fail-closed`
- Implementation seat: May
- Validation seat: Mack

This mission corrects only the specialist-dispatch authorization regression
described by issue #199. It does not create a new authority class, derive human
approval from caller assertions, change publication authority, mark a pull
request ready, merge, deploy, release, or exercise an external effect.

## Verified defect and integration constraint

`canDispatchSpecialists()` currently returns `true` when Mission Brief approval
is valid but both supported post-plan dispatch paths are absent. The exact
defect is:

```js
if (input.trainingWheelsOff !== true) return true;
```

The smallest policy correction is `return false`.

Delivery Workspace currently calls that policy with only `missionState` and
`approvalSource`, before it publishes/verifies the draft workspace and before
it evaluates durable Fury evidence. Therefore a direct one-line correction
would safely deny every Delivery Workspace invocation, including legitimate
explicit-Coulson and Training Wheels Off dispatches, and would also prevent the
early draft Mission Workspace promised by issue #70. The integration change
must preserve publication-before-plan-review while ensuring that only the final
`dispatch_ready` transition consumes dispatch authority.

## Frozen implementation

### 1. Correct the policy branch

In `contracts/mission-policy.mjs`, change the absent/non-true Training Wheels
Off branch to return `false`. Preserve the existing ordering:

1. exact approved mission and Coulson Mission Brief source;
2. explicit Coulson specialist-dispatch approval;
3. exact `trainingWheelsOff: true`;
4. every existing positive and negative bounded gate.

Do not loosen coercion, accept aliases, or add defaults.

### 2. Separate draft-workspace publication from final dispatch eligibility

In `github/delivery-workspace.mjs`, remove the pre-publication dispatch-policy
check. Draft creation/update, exact publication readback, and Fury evidence
evaluation remain in their current order. If Fury evidence is not eligible,
return the existing `workspace_ready` result without consulting specialist
dispatch authority.

Immediately before the sole `dispatch_ready` return, evaluate
`canDispatchSpecialists()` against a new required closed
`specialistDispatchPolicy` input object. Its fields are exactly the existing
policy inputs: mission state/source, optional explicit dispatch source,
Training Wheels Off selector, and all existing Fury/scope/repository/revision/
validation/runtime/material-risk gates. The top-level mission state/source must
canonical-match the nested values. Any missing, malformed, conflicting, or
ineligible object returns `blocked` with
`specialist_dispatch_not_approved`, after the verified draft workspace has been
produced but before `dispatch_ready` is exposed.

This object is an eligibility snapshot, not new authority or durable evidence.
The function continues to require independently persisted Fury evidence. No
new effect is performed after the policy evaluation.

Update the public declaration with the same closed shape. Do not make the
snapshot optional and do not infer Training Wheels Off from Fury PASS.

### 3. Tests

In policy tests, add explicit cases for absent, `false`, `null`, strings,
numbers, objects, and arrays. Keep the explicit Coulson happy path, exact
eligible Training Wheels Off happy path, and every individual existing gate
failure.

In Delivery Workspace tests:

- preserve early verified draft publication as `workspace_ready` while Fury is
  pending, even when dispatch policy is absent or false;
- prove an exact Fury PASS plus absent, false, malformed, or conflicting
  dispatch policy cannot return `dispatch_ready` and performs no additional
  effect after workspace publication;
- preserve `dispatch_ready` for exact explicit Coulson approval;
- preserve `dispatch_ready` for exact eligible Training Wheels Off evidence;
- prove each individual Training Wheels Off gate failure remains blocked;
- preserve schema-8 and schema-9 publication behavior and all existing failure
  semantics.

## Exact writable paths

- `packages/shield-team-system/contracts/mission-policy.mjs`
- `packages/shield-team-system/github/delivery-workspace.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/tests/mission-policy.test.mjs`
- `packages/shield-team-system/tests/delivery-workspace.test.mjs`

No mission-journal, signature, CLI, publication-authority, adapter, PR effector,
Fury evidence, May dispatch, fixture, or unrelated documentation changes are
authorized. If the closed policy snapshot cannot preserve both early workspace
publication and fail-closed dispatch within these paths, May must stop for Fury
reconciliation.

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
