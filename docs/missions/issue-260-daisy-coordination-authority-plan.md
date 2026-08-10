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

- contract/schema version, one canonical authority ref, mission/subject/revision,
  evaluated-through sequence, repository ID/root/branch/HEAD;
- `authorityKind: "daisy_feature_flight_coordination"`;
- `seatId: "daisy"`, the one fixed action ID, `effectClass: "coordination"`,
  one exact effect key, and `capabilityClass: "read_only_coordination"`;
- approved read roots and durable artifact root, each canonical and sorted;
- issued timestamp and Coulson signing-key reference.

The digest is not a payload field. After validating the closed payload, compute
`sha256(canonicalJson(payload))` externally and carry that digest only in the
signed envelope, journal entry, binding authorization, projection, and permission
result. This avoids a self-referential digest.

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
ref/external digest/sequence. Authority is appended at `N+1`; initial binding
authorization records `previousJournalSequence: N+1` and
`journalSequence: N+2`, and the binding records authority ref, external digest,
and authority sequence `N+1`. It contains `seatId: "daisy"`, pairwise-distinct
runtime/model/executor identities, fixed capability/action/effect values,
repository identity, binding version, prior-binding ID/version, and effective
sequence. Seat, runtime, model, and executor must be pairwise distinct, and the
three executor identities may not equal a canonical seat or mission participant.

Schema-9 receives additive entry types for:

- `coordination.authorized`
- `coordination.authority_revoked`
- `coordination.runtime_bound`
- `coordination.runtime_binding_superseded`

Replay validates signatures/digests, strictly increasing binding versions,
exact prior-binding linkage, exactly one issued authority, one active non-revoked
authority, and at most one active Daisy binding. This minimal version permits one
authority issuance per mission: revocation is terminal, makes every linked binding
non-projectable, and rejects reauthorization. There is no expiry field or trusted
clock behavior. Stale, mixed-seat, ambiguous, revoked, or unlinked evidence fails
closed.

### Projection and permission

Model seat dispatch as a discriminated union. Preserve the existing May variant
and canonical bytes exactly. Add a distinct Daisy variant containing
`daisyCoordinationAuthority`, `daisyRuntimeBinding`, and its own
`authorityPath`. Profile replay omits all Daisy properties when no Daisy entries
exist. Select the Daisy variant only when the Runner plan contains the exact fixed
Daisy tuple. Select the existing May variant only for May plans. No fallback, seat
substitution, optional-null field injection, or shared `authorityPath` is allowed.
Golden-byte tests bind unchanged May profile replay, dispatch projection,
permission context, and permission artifact.

Extend permission-context loading with two explicit closed branches:

- May → unchanged active Wheels Up authority and May binding path.
- Daisy fixed coordination tuple → active Daisy coordination authority/binding.

The Daisy loader returns a Daisy-specific ready variant containing immutable
`{authorityRef, authorityDigest, authoritySequence, approvedReadRoots,
durableArtifactRoot, bindingId, bindingVersion, runtimeId, modelId, executorId}`
alongside the unchanged generic permission context. Its
`canonicalWritableRoot` equals the durable artifact root exactly. That root must
be canonical and non-overlapping with the repository, every worktree, and approved
read roots. Both branches preserve exact mission/subject/revision/sequence/
repository/action/effect/runtime/executor binding and fail before effects on stale
or ambiguous evidence.

## Operator flow

Add one dedicated command:

`shield mission authorize-daisy-coordination --mission-id ID --input FILE --root .`

The input contains only operator intent: exact effect key, canonical read roots
and artifact root, runtime/model ID, and executor ID. Repository/base/branch/HEAD
are derived from host observation. The validation ID is fixed as
`validation:feature-flight.daisy-result-v1`; callers cannot select validation
commands. The command derives mission/subject/revision/sequence, fixed
seat/action/effect/capability, authority IDs, digest, and binding linkage from
fresh replay and host observation.

It follows the existing one-passcode display/sign/revalidate/append transaction:
preflight every payload and repository observation, show exactly what the PIN
authorizes, collect one Coulson passcode, re-read all bytes and observations,
append signed authority plus initial runtime binding as one exact consecutive
two-entry mission-store batch, read back, and emit a credential-free receipt.
The existing batch append lock/write-sync/rename/directory-sync/readback algorithm
is reused; no new journal writer is introduced. Empty PIN is a no-write preflight.
Preconditions are active mission authorization, execution `not-started`, final
acceptance waiting, and no prior Daisy authority or binding. Post-display input,
journal, repository, or signer drift aborts without a partial batch.

## Acceptance matrix

| ID | Case | Required result |
| --- | --- | --- |
| D260-01 | exact fresh Daisy authority + binding | signed entries replay; projection and permission are exact-ready |
| D260-02 | existing May mission | projection/permission bytes and outcomes remain unchanged |
| D260-03 | May authority/binding supplied to Daisy | fail closed before permission |
| D260-04 | Daisy authority/binding supplied to May | fail closed before permission |
| D260-05 | seat/action/effect/capability substitution | malformed or scope mismatch; no fallback |
| D260-06 | mission/subject/revision/sequence/repository drift | stale/mismatch; no ready projection |
| D260-07 | missing/multiple/revoked/reauthorized authority | blocked or invalid; revocation is terminal |
| D260-08 | stale/duplicate/broken binding lineage | invalid; prior binding never reactivates |
| D260-09 | any seat/runtime/model/executor equality or participant impersonation | malformed |
| D260-10 | closed CLI input + empty PIN | credential-free manifest; no journal append |
| D260-11 | one-passcode success | N+1 authority and N+2 binding append/read back as one atomic batch |
| D260-12 | post-display journal/repository/input drift | transaction aborts without partial append |
| D260-13 | attempted fixture/network/publication effect | absent from scope and rejected by permission |

Tests must use hostile own-property/accessor/proxy, malformed-signature/digest,
stale replay, cross-seat, duplicate, supersession, and revocation vectors. Existing
May fixtures remain unchanged and pass new golden-byte assertions for replay,
dispatch projection, permission context, and permission artifact.

## Exact implementation paths

- `packages/shield-team-system/src/daisy-coordination-authority-v1.mts`
- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/src/schema9-seat-dispatch-projection-v1.mts`
- `packages/shield-team-system/src/schema9-permission-context-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/public/daisy-coordination-authority.mjs`
- `packages/shield-team-system/public/daisy-coordination-authority.d.mts`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/tests/daisy-coordination-authority-v1.test.mjs`
- `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`
- `packages/shield-team-system/tests/schema9-seat-dispatch-projection-v1.test.mjs`
- `packages/shield-team-system/tests/schema9-permission-context-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/mission-store.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `docs/missions/issue-260-daisy-coordination-authority-plan.md`

The dedicated public package subpath exports only the closed authority/binding
constructors and validators; it does not alter `./mission`. Mission-store tests
cover exact two-entry batch append, injected pre-rename failures with no append,
and post-rename uncertainty with exact readback/recovery semantics. Any additional
required path stops for plan revision.

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
