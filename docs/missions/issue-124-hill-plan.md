# Issue #124 — Canonical Seat and Human-Gate Taxonomy Plan

## Mission identity

- Issue: `#124`
- Mission: `mission:issue-124-role-taxonomy-v1`
- Base revision: `d4f9c170821365c22a1e11e1cdc88e7364a89bb1`
- Profile: `standard@1`
- Implementation owner: May
- Validation owner: Mack
- Architecture gates: Fury plan review and exact-head conformance review
- Human authority: Coulson

This mission does not alter the completed Mission #130 or #131 journals. It
preserves all existing persisted `seatId` values.

## Objective

Introduce one dependency-free, closed, versioned taxonomy that distinguishes
dispatchable SHIELD seats from non-dispatchable human gates and make current
intake, permission, and provenance validation consume it.

## Closed v1 taxonomy

Dispatchable seats:

- `hill`
- `daisy`
- `fury`
- `may`
- `mack`
- `oracle`

Human gates:

- `coulson`
- `fitz`
- `simmons`

The canonical role ID and compatibility `seatId` are identical in v1.

Human gates are never assigned models, reasoning runtimes, tool executors,
tools, or dispatch actions. Their state changes only from separately verified
human evidence. Dispatchable seats may receive those capabilities only through
the existing host, runtime-binding, permission, and tool policies; taxonomy
membership grants no authority.

## Implementation plan

1. Add a dependency-free `role-taxonomy-v1.mts` module with:
   - closed schema and contract versions;
   - the nine canonical role IDs;
   - discriminated role definitions for `dispatchable_seat` and `human_gate`;
   - immutable registry data;
   - exact lookup and classification helpers;
   - a closed role-assignment validator that rejects model, runtime, executor,
     tool, or dispatch assignment to a human gate;
   - a routing projection that returns either `dispatch_seat` or
     `wait_for_human_gate`;
   - fail-closed results for unknown or malformed roles and assignments.
2. Preserve the existing `mission-profile` public surface:
   - keep `MISSION_ROLE_IDS` and `MissionRoleId` as the human profile-gate
     subset;
   - re-export the canonical registry and compatible role-definition type from
     the taxonomy module;
   - do not permit dispatchable seats to become profile authorization or final
     acceptance gates.
3. Replace duplicated classification in current consumers:
   - mission intake derives participant kinds and pending human gates from the
     canonical taxonomy;
   - permission binding validation accepts only canonical dispatchable seats
     and rejects human gates and unknown seats;
   - seat/runtime/executor anti-impersonation checks use all canonical role IDs;
   - mission review provenance uses the canonical role IDs instead of a local
     set.
4. Add the documented `@shield/team-system/roles` package subpath and keep
   declarations generated from source.
5. Document compatibility:
   - `seatId` remains unchanged;
   - V0.3 repository configuration remains a supported deployment subset and
     is not silently expanded in this mission;
   - Mack and Oracle become canonical dispatchable identities but require
     separate configuration/runtime enablement before actual dispatch.
6. Add focused tests proving:
   - all nine roles have one unambiguous classification;
   - all three human gates reject model, runtime, executor, tools, and dispatch;
   - all six dispatchable seats produce dispatch routing;
   - unknown roles fail closed;
   - intake and permission consumers use the canonical distinction;
   - runtime/executor identities cannot impersonate Mack or Oracle;
   - existing mission profiles, configs, journals, and package imports remain
     compatible.

## Expected files

- `packages/shield-team-system/src/role-taxonomy-v1.mts` — new
- `packages/shield-team-system/src/mission-profile-v1.mts`
- `packages/shield-team-system/src/mission-intake-v1.mts`
- `packages/shield-team-system/src/permission-v1.mts`
- `packages/shield-team-system/src/mission-v2.mts`
- `packages/shield-team-system/package.json`
- focused tests and package-surface documentation
- `docs/missions/issue-124-role-taxonomy.md`

May may narrow this set when a listed consumer already derives the same
classification through an equivalent canonical import. May must not expand it
to dispatch receipts, runtime routing, provider configuration, local-model
adapters, scheduling, UI, or Issue #118 implementation.

## Validation

- TypeScript build.
- Focused role, profile, intake, permission, mission/provenance, config, and
  package-surface tests.
- Full `@shield/team-system` package suite.
- Packed strict TypeScript consumer.
- `git diff --check`.

## Stop conditions

Stop and return to Fury if the implementation would:

- invalidate existing schema-v1 repository configuration;
- rename or remove a persisted `seatId`;
- make a dispatchable seat a human approval gate;
- let taxonomy membership grant runtime or tool authority;
- require a mission/journal schema mutation;
- introduce an import cycle;
- implement Issue #118 receipts or broaden runtime dispatch.

After exact-head Mack and Fury approval, publish a draft PR and stop for
Coulson merge. Issue #118 begins only from the exact #124 merge commit.
