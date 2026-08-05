# Mission #141 child plan — schema-9 Delivery Workspace dispatch projection

## Identity

- Parent: #141 — typed mission authority and seat-gate map
- Base revision: `e0ba83637ad436a1ac102e34b5f816eb4db12ae6`
- Mission: `mission:issue-141-dispatch-projection-plan`
- Authority: planning and reconnaissance only
- Status: frozen for Fury review; implementation is not authorized

## Objective

Restore Delivery Workspace's positive `dispatch_ready` path after #199 by
projecting current durable schema-9 authority into the existing specialist
dispatch policy. The projection must be evidence-derived, exact-bound, and
fail closed; it must not accept caller assertions as authority.

## Smallest child boundary

Introduce one shared loader, provisionally
`loadSchema9SeatDispatchProjectionV1`, below both Delivery Workspace and the
runner-specific permission-context loader. It reads and replays the canonical
profile-aware journal, validates the active implementation authority and May
runtime binding, proves that every profile-required execution gate is satisfied,
requires a nonterminal not-started lifecycle, observes the live repository, and
returns a closed immutable projection. `loadSchema9PermissionContextV1` may
consume the shared result but retains its runner-plan, capability, writability,
and effect-key checks.

Delivery Workspace combines that projection with its already verified draft-PR
receipt and independently attributed Fury plan-review evaluation. Only the
existing `canDispatchSpecialists` function makes the final policy decision.
No second authority DTO, signature implementation, journal transition, or
parallel policy engine is introduced.

## Closed projection

The ready variant contains exactly:

- contract version and projection digest;
- journal schema version and journal digest;
- exact mission ID, subject ID, mission revision, artifact revision, and
  evaluated-through sequence;
- replayed signed mission authorization identity and state;
- the selected profile/requirements digest, execution readiness, satisfied
  execution-gate evidence references, and nonterminal lifecycle state;
- active implementation-authority identity, digest, sequence, approved scope,
  repository ID, canonical root, branch, base revision, and HEAD revision;
- active May runtime-binding identity, digest, sequence, reasoning runtime,
  model, tool executor, approved scope, repository ID, canonical root, branch,
  and artifact revision;
- twice-observed live canonical root, branch, and HEAD;
- authority path: `explicit_wheels_up` or
  `delegated_training_wheels_off`;
- a closed material-gate disposition.

The blocked variant contains a stable reason code and diagnostic strings, but
no partial authority projection.

## Authority and material-gate semantics

Two policy paths remain distinct:

1. `explicit_wheels_up` is derived only from current signed Coulson mission
   authorization plus the current active schema-9 implementation authority.
   It maps to `specialistDispatchApprovalSource: "coulson"`. The Training
   Wheels Off material gates are recorded as
   `not_applicable_explicit_authority`; they are not fabricated as `true` or
   `false` and do not authorize this path.
2. `delegated_training_wheels_off` requires durable, current evidence for every
   material gate consumed by `canDispatchSpecialists`. No canonical producer
   for that complete evidence set exists at the reviewed base, so this path is
   blocked as `material_gate_evidence_unavailable` in this child. A caller may
   not supply those booleans.

This child restores only the explicit signed Wheels Up positive path. It does
not weaken or silently disable the delegated path.

## Exact joins

The loader performs two journal reads around two repository observations and
requires unchanged canonical content. All dynamic evidence must agree on:

- mission ID and subject ID;
- mission revision and artifact/HEAD revision;
- repository ID, canonical root, branch, and base revision;
- active implementation-authority and runtime-binding identities/digests;
- evaluated journal sequence.

The journal projection must report `readiness.execute: "ready"`, execution
`not-started`, final acceptance not accepted, and no pending profile execution
requirement. A signed implementation authority cannot bypass a required Fitz or
Simmons gate.

Delivery Workspace additionally requires its verified publication request,
draft-PR receipt, Fury review evidence, Fury dispatch attribution, blueprint
identity/path, PR number, and repository revision to match the projection.
Missing, stale, conflicting, malformed, accessor-backed, inherited, symbolic,
proxy-backed, or unknown input fails closed.

## Delivery Workspace integration

- Keep the existing synchronous API unchanged and unable to produce the new
  positive authority path. Add an asynchronous Delivery Workspace entry point
  for governed dispatch composition; this avoids a breaking return-type change.
- The asynchronous entry point invokes the canonical shared schema-9 loader
  directly. It may accept only the loader's ordinary identifiers, paths, and
  trusted host-operation capabilities; it must not accept a callback or object
  capable of asserting a ready projection, nor add raw authority booleans to
  public input.
- Preserve early draft-workspace publication and readback before Fury evidence
  is eligible.
- After initial verified publication and Fury evaluation, load and exact-match
  the projection. Because that load crosses an async boundary, then re-read and
  re-evaluate the publication authorization, current draft-PR state/receipt,
  Fury evidence ledger, Fury dispatch attribution, and plan gate without
  performing a write or update. Any drift blocks.
- Construct a fresh plain policy snapshot internally from only that final
  evidence set and call `canDispatchSpecialists` once.
- Return `dispatch_ready` only for an eligible Fury review plus a ready,
  exact-current `explicit_wheels_up` projection and an allowed final policy
  decision.
- Perform no command, publication, model invocation, journal append, or other
  external effect after that final policy decision.
- Continue returning `workspace_ready` while Fury is pending. Authority or
  projection failure after publication returns `blocked` with the existing
  publication commands as evidence, never `dispatch_ready`.

## Files permitted in the child implementation

- one new schema-9 seat-dispatch projection source module;
- the existing schema-9 permission-context loader, only to consume the shared
  projection without changing permission/effect semantics;
- Delivery Workspace implementation and its public declaration;
- focused tests for the new projection, Delivery Workspace, and permission
  context; public exports only where required by existing package conventions.

No CLI, mission journal schema, signer, local-model adapter, model invocation,
database, UI, merge, deploy, release, or #137 fixture code is in scope.

## Acceptance criteria

- [ ] Positive `dispatch_ready` is proven for current signed schema-9 Wheels Up,
      current May binding, exact live root/branch/HEAD, exact verified draft-PR
      receipt, and eligible independently attributed Fury evidence.
- [ ] Missing, stale, malformed, conflicting, substituted, or drifting mission
      authorization, implementation authority, runtime binding, sequence,
      root, branch, HEAD, publication receipt, or Fury evidence blocks before
      `dispatch_ready`.
- [ ] `dispatch_ready` requires profile execution readiness and every required
      Fitz/Simmons execution gate; active Wheels Up cannot bypass them.
- [ ] The loader rejects non-plain, inherited, accessor, symbolic,
      non-enumerable, and proxy-backed host inputs without triggering traps.
- [ ] The explicit Wheels Up and delegated Training Wheels Off paths remain
      distinct; unavailable material-gate evidence cannot be caller asserted.
- [ ] Early draft publication remains possible while Fury is pending.
- [ ] The existing synchronous API remains compatible; the new positive path is
      additive and async, invokes the canonical loader directly, and revalidates
      publication/PR/Fury evidence after its final await.
- [ ] No external effect occurs after the final specialist-dispatch policy
      decision, and this ordering is tested with call tracing.
- [ ] Existing runner permission, capability narrowing, exact effect-key, and
      write-evidence behavior remains unchanged.
- [ ] Tests exercise independently assembled evidence and mutations at every
      join; they do not merely copy implementation constants.
- [ ] The full package suite and package-surface checks pass, with #182's known
      shared-`dist` race isolated from product failures.

## Stop conditions

Stop on any requirement for a new authority class, caller-supplied material
gate, journal schema change, model invocation, external #137 run, #29 work, or
scope beyond this child. Return the exact plan to Fury before implementation.
