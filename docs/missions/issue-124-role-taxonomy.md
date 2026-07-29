# Issue #124 — Canonical Mission Role Taxonomy

## Decision and implementation

The additive v1 role taxonomy is consumed by the current mission, permission,
and runner boundaries without renaming persisted `seatId` values.

- `mission-intake-v1` now normalizes participant seats and recommendations through
  taxonomy projection/validation.
- `mission-v2` brief/anti-impersonation checks now defer to canonical role
  validation and a canonical nine-seat anti-impersonation set.
- `profile-aware-mission-v1` brief activation validation now defers dispatch-mode
  seat checks to taxonomy assignment validation.

## Canonical v1 registry

- Dispatchable seats: `hill`, `daisy`, `fury`, `may`, `mack`, `oracle`
- Human gates: `coulson`, `fitz`, `simmons`

Canonical role IDs are the same as persisted `seatId` values.

## Runtime behavior

- `ROLE_TAXONOMY_SCHEMA_VERSION = 1`
- `ROLE_TAXONOMY_CONTRACT_VERSION = "roles.v1"`
- lookup, classification, and routing are closed over nine roles only
- malformed role IDs and unknown role IDs fail closed
- `routingProjection` returns:
  - `dispatch_seat` for dispatchable seats
  - `wait_for_human_gate` for human gates
- `validateRoleAssignment` denies model, reasoning runtime, tool executor, and tool
  assignments to human gates
- when `requireV03Enabled` is requested, `validateRoleAssignment("dispatch", ...)`
  additionally requires V0.3 enablement and rejects `mack` and `oracle`

## Package changes

- `@shield/team-system/roles` is exported to surface:
  - `CANONICAL_ROLE_IDS`
  - `CANONICAL_ROLE_REGISTRY_V1`
  - role classification and routing helpers
  - assignment validation helpers

## Compatibility constraints

- `mission-profile` constants and contract/type discriminants remain unchanged:
  `MISSION_PROFILE_CONTRACT_VERSION`, `CANONICAL_MISSION_ROLE_REGISTRY_V1`, and
  `MISSION_ROLE_IDS` continue to publish the unchanged human gate profile set.
- No mission journal schema changes are introduced in this milestone.
- Consumers outside `mission-intake-v1`, `permission-v1`, `runner-v1`, `mission-v2`,
  `profile-aware-mission-v1`, and `mission-profile` are not edited in this issue.
