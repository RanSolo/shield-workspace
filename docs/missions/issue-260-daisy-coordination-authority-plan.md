# Issue #260 — signed schema-9 Daisy coordination authority

## Frozen identity and purpose

- Repository: `RanSolo/shield-workspace`
- Exact planning base: `27d3fe7ab3051fd9b8a33032912dae65c389f4f2`
- Parent/blocking relation: prerequisite for #259 and the #251 proving flight
- Fixed seat/action/capability: `daisy`,
  `action:feature-flight.daisy.reconnaissance`, `coordination`,
  `read_only_coordination`

Current schema-9 implementation authority, runtime binding, dispatch projection,
and permission loading are intentionally May/Wheels-Up-only. Feature Flight
requires a Daisy Runner plan, so no current journal can authorize the production
bridge. This slice adds one disjoint signed Daisy coordination lane. It does not
reinterpret, genericize, or weaken May authority.

## Contract design

### Independent authority

Add `daisy-coordination-authority-v1.mts` rather than widening
`implementation-authority-v1.mts`. The signed payload is closed and contains:

- contract/schema version, authority ID/ref/digest, mission/subject/revision,
  evaluated-through sequence, repository ID/root/branch/HEAD;
- `authorityKind: "daisy_feature_flight_coordination"`;
- `seatId: "daisy"`, the one fixed action ID, `effectClass: "coordination"`,
  one exact effect key, and `capabilityClass: "read_only_coordination"`;
- approved read roots and durable artifact root, each canonical and sorted;
- issued/expiry timestamps and Coulson signing-key reference.

The authority grants only the fixed coordination action and bounded artifact
writes beneath its one exact root. It grants no implementation, arbitrary process,
fixture invocation, network write, publication, merge, deployment, release, or
human-review authority.

Provide closed constructors and validators for signed authorization and signed
revocation. Reuse the existing Ed25519 verification/canonical-digest primitives,
but do not accept a May implementation-authority payload through a union or
fallback branch.

### Independent runtime binding lifecycle

Add a Daisy coordination runtime-binding payload bound to the exact authority
ref/digest/sequence. It contains `seatId: "daisy"`, distinct runtime/model and
executor identities, fixed capability/action/effect values, repository identity,
binding version, prior-binding ID/version, and effective sequence.

Schema-9 receives additive entry types for:

- `coordination.authorized`
- `coordination.authority_revoked`
- `coordination.runtime_bound`
- `coordination.runtime_binding_superseded`

Replay validates signatures/digests, strictly increasing binding versions,
exact prior-binding linkage, one active non-revoked authority, and at most one
active Daisy binding. Stale, mixed-seat, ambiguous, revoked, or unlinked evidence
fails closed. Existing implementation/runtime entries and May projection bytes
retain their current semantics.

### Projection and permission

Extend schema-9 seat dispatch projection additively with a separately named
`daisyCoordinationAuthority` and `daisyRuntimeBinding`. Select the Daisy lane
only when the Runner plan contains the exact fixed Daisy tuple. Select the existing
May lane only for May plans. No fallback, seat substitution, or shared
`authorityPath` value is allowed.

Extend permission-context loading with two explicit closed branches:

- May → unchanged active Wheels Up authority and May binding path.
- Daisy fixed coordination tuple → active Daisy coordination authority/binding.

Both branches preserve exact mission/subject/revision/sequence/repository/action/
effect/runtime/executor binding and fail before effects on stale or ambiguous
evidence.

## Operator flow

Add one dedicated command:

`shield mission authorize-daisy-coordination --mission-id ID --input FILE --root .`

The input contains only operator intent: repository base revision, exact effect
key, canonical read roots/artifact root, runtime/model ID, executor ID, and
validation command IDs. The command derives mission/subject/revision/sequence,
repository root/branch/HEAD, fixed seat/action/effect/capability, authority IDs,
digests, and binding linkage from fresh replay and host observation.

It follows the existing one-passcode display/sign/revalidate/append transaction:
preflight every payload and repository observation, show exactly what the PIN
authorizes, collect one Coulson passcode, re-read all bytes and observations,
append signed authority plus initial runtime binding durably, read back, and emit
a credential-free receipt. Empty PIN is a no-write preflight. The command cannot
authorize a mission already executing or carrying active Daisy coordination
authority.

## Acceptance matrix

| ID | Case | Required result |
| --- | --- | --- |
| D260-01 | exact fresh Daisy authority + binding | signed entries replay; projection and permission are exact-ready |
| D260-02 | existing May mission | projection/permission bytes and outcomes remain unchanged |
| D260-03 | May authority/binding supplied to Daisy | fail closed before permission |
| D260-04 | Daisy authority/binding supplied to May | fail closed before permission |
| D260-05 | seat/action/effect/capability substitution | malformed or scope mismatch; no fallback |
| D260-06 | mission/subject/revision/sequence/repository drift | stale/mismatch; no ready projection |
| D260-07 | missing/multiple/revoked authority | blocked or invalid deterministically |
| D260-08 | stale/duplicate/broken binding lineage | invalid; prior binding never reactivates |
| D260-09 | runtime equals executor or identity substitution | malformed |
| D260-10 | closed CLI input + empty PIN | credential-free manifest; no journal append |
| D260-11 | one-passcode success | authority and binding appended atomically/read back exactly |
| D260-12 | post-display journal/repository/input drift | transaction aborts without partial append |
| D260-13 | attempted fixture/network/publication effect | absent from scope and rejected by permission |

Tests must use hostile own-property/accessor/proxy, malformed-signature/digest,
stale replay, cross-seat, duplicate, supersession, and revocation vectors. Existing
May fixtures remain unchanged and pass byte-for-byte projection assertions where
already canonicalized.

## Exact implementation paths

- `packages/shield-team-system/src/daisy-coordination-authority-v1.mts`
- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/src/schema9-seat-dispatch-projection-v1.mts`
- `packages/shield-team-system/src/schema9-permission-context-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/cli.mts`
- `packages/shield-team-system/public/mission.mjs`
- `packages/shield-team-system/public/mission.d.mts`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/tests/daisy-coordination-authority-v1.test.mjs`
- `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`
- `packages/shield-team-system/tests/schema9-seat-dispatch-projection-v1.test.mjs`
- `packages/shield-team-system/tests/schema9-permission-context-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `docs/missions/issue-260-daisy-coordination-authority-plan.md`

If the existing public mission surface does not export analogous authority
constructors, omit the two public files and package-surface change rather than
inventing a new public API. Any additional required path stops for plan revision.

## Validation

At exact implementation HEAD:

1. focused authority, replay, projection, permission, and CLI tests;
2. `npx nx test @shield/team-system --skip-nx-cache`;
3. `npm test --workspace @shield/team-system`;
4. `npm pack --workspace @shield/team-system --dry-run`;
5. exact changed-path comparison against the Fury-reviewed plan base;
6. `git diff --check <reviewed-plan-commit>..HEAD`;
7. clean worktree and recorded exact HEAD.

Mack independently proves both Daisy positive and hostile cases plus unchanged
May behavior. Fury performs exact-revision conformance review.

## Stop conditions and exclusions

Stop on any need to genericize May authority, accept caller-asserted authority,
loosen exact repository/sequence binding, permit more than the fixed Daisy tuple,
or touch #259 adapter/fixture code. This issue performs no fixture run, model
dispatch, GitHub write, publication, merge, deployment, release, or #29 work.

