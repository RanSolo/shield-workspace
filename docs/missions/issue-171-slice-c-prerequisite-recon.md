# Issue #171 Slice C prerequisite reconnaissance

## Evidence identity

- Mission: `mission:issue-171-slice-c-prerequisite`
- Mission revision: `sha256:14pmqgHwaF6y_VdD5laf6zpQpYQHQTqwjfjlSAhRNW0`
- Repository revision inspected: `d5657ea2c59759b8494fb679bc82e0c47756e90f`
- Authority: planning and read-only reconnaissance only
- Implementer dispatch: prohibited

## Observed contract boundary

1. `profile-aware-mission-v1.mts` is the canonical schema-9 journal and replay
   plane. It records mission authorization, execution transitions/effects,
   review evidence, and final acceptance, but it has no implementation-authority
   record and no runtime-binding state.
2. `mission-v2.mts` contains the existing signed runtime-binding authorization,
   initial binding, supersession, and active-binding replay semantics. Although
   the broad entry union mentions schema 9, its constructors and replay branches
   explicitly accept only schemas 6 through 8. It is not a schema-9 producer.
3. `permission-v1.mts` accepts schema-9 permission contexts and validates active
   `RuntimeBinding` values, but it consumes caller-supplied context. It does not
   produce authoritative schema-9 bindings.
4. `mission-runtime-v1.mts` obtains that permission context from the host through
   `getPermissionContext`. It does not derive the active binding from the
   profile-aware journal before execution.
5. `review-publication-v1.mts` has a `wheels_up` discriminator, but its authority
   is intentionally bounded to review branch push, review comment publication,
   and draft pull-request creation/update. It cannot authorize implementation
   actions or tool effects and must not be relabeled as implementation authority.
6. Issue #141 is projection-only by frozen design. It may consume a verified
   Wheels Up source later, but it cannot create that source.

## Architecture conclusion

No canonical positive schema-9 Wheels Up producer currently exists. The active
May runtime-binding supersession path exists only in the legacy supervised
schema-6-through-8 plane. The narrow repair is one upstream schema-9 journal
contract slice that introduces a distinct signed implementation-authority record
and reuses the existing `RuntimeBinding`, signed binding authorization, initial
recording, supersession, and active-projection invariants in schema 9.

The new implementation-authority record must be the positive Wheels Up source;
mission governance authorization, Wheels Off eligibility, review publication,
packet prose, host callbacks, audit receipts, control events, and Fury evidence
remain non-substitutable. Runtime bindings must reference the exact active Wheels
Up authorization and may narrow but never widen its scope.

## Deferred composition

This prerequisite does not make a May dispatch runnable. Issue #171 Slice C must
later load the replayed authority and active binding into the production
permission context. Issue #170 must later compose the dispatch. No CLI command,
model invocation, tool effect, migration, merge, deployment, release, or external
run belongs to this prerequisite.

