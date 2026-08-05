# Mission #141 child — Fury plan-review handoff

## Review identity

- Seat: Fury
- Parent issue: #141
- Base revision: `e0ba83637ad436a1ac102e34b5f816eb4db12ae6`
- Plan: `docs/missions/issue-141-delivery-dispatch-projection-plan.md`
- Review type: architecture-plan conformance

## Decision requested

Determine whether the plan is the smallest safe implementation child that can
restore Delivery Workspace's positive `dispatch_ready` path without creating a
second authority source or allowing caller-asserted material gates.

Review especially:

1. extracting a shared replay/live-host projection beneath
   `loadSchema9PermissionContextV1` instead of adapting its runner-specific
   context directly;
2. mapping current signed schema-9 Wheels Up to the existing explicit Coulson
   dispatch path;
3. representing Training Wheels Off material gates as unavailable—not false
   evidence—until a canonical producer exists;
4. exact joins across journal sequence, authorization, implementation
   authority, May binding, root/branch/HEAD, draft-PR receipt, and Fury evidence;
5. preservation of early draft publication and the no-effects-after-final-
   decision boundary.

Hill reconciliation after the first Fury pass must also prove:

- profile execution readiness and all required Fitz/Simmons execution gates;
- direct canonical loader invocation rather than a caller-supplied projection;
- an additive async Delivery Workspace API with fresh publication/PR/Fury
  readback after the loader await and before the final policy decision.

Return `APPROVE` or `REVISE`, with blocking findings first. This review grants
no implementation, model-dispatch, merge, release, #137, or #29 authority.
