# Issue #203 — One-passcode Wheels Up plan

## Frozen identity and boundary

- Mission: `mission:issue-203`
- Mission revision: `sha256:QNmv-sKt8qN-sFWOqoxn9RVhGmg2Gl0GEILGGkMaQnI`
- Repository: `RanSolo/shield-workspace`
- Base revision: `0de32599f26ba38fb8a66f9868035f48a1644685`
- Exact plan and current initial-publication HEAD: the exact reviewed Git HEAD,
  bound externally by Fury review and Coulson authorization; it is never the
  base revision and is not self-embedded in this committed document.
- Mode: Delivery
- Human gates: Coulson authorizes; Fitz remains the human technical-review gate.

Implement one schema-9 CLI flow that turns one displayed operator decision and
one passcode prompt into the existing mission authorization, Wheels Up
implementation authority, May runtime binding, and initial draft-review
publication authority. Do not create a new authority class, verbal authority,
caller-asserted approval, merge authority, deployment authority, release
authority, or final acceptance.

## Existing contracts to preserve

The implementation must reuse the existing constructors and validators for:

1. `governance.decided` mission authorization;
2. `implementation.authorized` Wheels Up authority;
3. `runtime.binding_recorded` May binding;
4. `review.publication_authorized` review publication authority.

No aliases or new event types are permitted. Each constituent payload remains separately signed by the configured Coulson
key, separately validated, and independently replayable. Existing granular
`authorize`, `wheels-up`, `bind`, and `publication-authorize` commands remain
available and unchanged for advanced use and recovery.

## Operator command and closed input

Add:

```text
shield mission authorize-wheels-up --mission-id <id> --input <file> [--root <path>] [--passcode-stdin] [--json]
```

The closed input combines only the existing Wheels Up, May-binding, and initial
review-publication intent fields:

- base revision and May model;
- approved paths, actions, effect classes, effect keys, capabilities, and
  validation command IDs;
- May reasoning-runtime and tool-executor IDs;
- exact initial draft-publication paths.

Mission, subject, mission revision, repository, canonical root, branch, HEAD,
human binding, journal sequences, authority IDs, digests, timestamps, remaining
human gates, and exclusions are derived by the host. Publication effects are
host-fixed to exactly `review.branch.push` and
`review.pull_request.create_draft`; the input cannot request effects. Unknown, inherited,
accessor-backed, symbolic, non-enumerable, proxy-backed, duplicated, unsorted,
or malformed input fails before prompting or appending.

Before requesting the passcode, render one closed manifest containing every
derived binding and requested authority plus explicit exclusions. Interactive
mode prints the human-readable manifest before `Passcode:`. JSON/stdin mode
prints one deterministic machine-readable preview without contaminating the
final receipt output contract.

The initial publication authority is bound to exact base
`0de32599f26ba38fb8a66f9868035f48a1644685`, the clean exact reviewed planning
HEAD supplied by Git observation, and that exact observed base-to-head path
set. It authorizes only initial draft publication and rejects
`review.comment.publish` and `review.pull_request.update_draft`. Every later
implementation-HEAD push or update requires fresh exact publication authority.
A ready-for-review transition, merge, deployment, release, or final acceptance
remains separately gated.

## One signer unlock, four signatures

Use a two-phase construction. Before prompting, derive and validate all four
closed payloads with contiguous sequences from the frozen initial projection
and host observations. Payload derivation may use deterministic staged
projections, but no signature or entry is yet exposed. Canonical-freeze the
ordered payload list and manifest.

Add a signer helper that unlocks and verifies the configured private key once,
signs that ordered closed list of constituent payloads, and releases the key
without retaining a reusable signer session. It returns one signature per
payload in order. Any unlock, key-reference, payload, or signing failure
returns no signatures to the caller and performs no journal write.

After signing, independently verify all four signatures against the frozen
Coulson public key before exposing a signature or writing. Then inject each
signature into the existing constructor sequentially and replay after each
entry to derive the exact projection required by the next constructor. The
staged projection and payloads must canonical-match the pre-prompt frozen
values. No constructor may accept a caller-asserted sequence or authority that
disagrees with replay.

## Atomic journal transition

Add a schema-9 multi-entry store operation. Under the existing per-mission
lock, it must:

1. snapshot and validate a non-empty ordered entry list plus the expected
   starting journal-byte SHA-256 digest;
2. reread the current journal and require the first sequence to equal current
   sequence plus one and every later sequence to be contiguous;
3. replay the complete candidate journal before writing;
4. compare the live starting bytes to the expected digest under the lock before
   creating any temporary file;
5. write the complete candidate journal to a confined, exclusive, regular
   sibling named `<journal filename>.batch-<cryptographic nonce>.tmp` with mode
   `0600`, retaining its opened file identity;
6. verify exact temporary bytes, mode, regular-file identity, and confinement;
   sync it; then revalidate live lock, journal identity, unchanged original
   bytes, and the starting digest immediately before rename;
7. atomically rename the complete candidate over the journal, preserving the
   journal mode as `0644` in the installed candidate;
8. sync the parent directory, reread exact candidate bytes, replay the result,
   and prove that no orphan temporary path remains;
9. return the final projection and exact receipt only after lock release is
   proven.

No multi-line append is permitted: a short append could end on a valid entry
boundary and expose partial usable authority. The only visible journal states
may be the exact original bytes or exact complete candidate bytes. An ordinary
failure is allowed only when rename was never attempted and temporary cleanup
and lock release are both proven. An uncertain or successful rename followed
by any directory-sync, readback, replay, orphan-cleanup, or lock-release fault
returns `recovery_required`; callers must inspect replay and must not retry
blindly. On startup or retry, an orphan matching the exact sibling naming
contract blocks with `recovery_required` until identity-safe operator recovery.
Temporary identity drift, symlinks, gitlinks, short writes, sync failures,
rename failures, readback mismatch, and cleanup uncertainty fail closed.

## Freshness and no-expansion checks

Immediately after signing and immediately before the atomic store operation,
re-read and canonical-compare:

- repository configuration and configured journal path;
- canonical root, Git top-level, origin repository identity, attached branch,
  base ancestry, HEAD, clean status, exact changed paths, symlink paths, and
  gitlink paths;
- mission journal bytes and SHA-256 digest, sequence, mission revision, pending authorization,
  and absence of current implementation/binding/publication records;
- every displayed manifest field and every derived constituent payload.

Any mismatch returns before journal mutation. The batch may contain no field,
path, effect, capability, identity, or authority not present in the displayed
manifest or host-derived fixed fields.

## Receipt

Define closed `shield.wheels-up-authorization-manifest.v1` and
`shield.wheels-up-authorization-receipt.v1` schemas. Canonical JSON SHA-256 is
the sole digest algorithm for both schemas and every signed envelope.

The manifest includes its `manifestDigest` computed over the manifest with the
digest field omitted. In interactive mode the complete manifest is printed to
the terminal before `Passcode:`. In `--json --passcode-stdin` mode, one
deterministically framed manifest preview is written to stderr; stdout remains
empty until it receives exactly one final receipt JSON document.

After exact durable readback, return one closed receipt containing:

- mission, subject, mission revision, repository, root, branch, base, and HEAD;
- evaluated starting and ending journal sequences;
- manifest digest and final journal-byte SHA-256 digest;
- for each constituent: exact event type, entry ID, sequence,
  authority/evidence/authorization ID, and canonical signed-envelope SHA-256;
- selected May model/runtime/executor;
- authorized implementation and publication scopes;
- explicit exclusions and remaining human gates.

Do not include the passcode, private-key material, credentials, raw signer
record, or unbounded environment data.

## Exact implementation scope

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-signer.mts`
- `packages/shield-team-system/src/mission-store.mts`
- `packages/shield-team-system/tests/mission-store.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/SUPERVISED_MISSION.md`
- `docs/missions/issue-203-one-passcode-brief.json` (immutable during implementation)
- `docs/missions/issue-203-one-passcode-plan.md` (immutable after Fury approval)

These are eight exact paths. Only the six package code, test, and operator-
documentation paths are implementation-mutable.

Do not change authority classes, profile definitions, journal schema number,
adapter meaning, delivery behavior, or package exports unless Fury identifies
an unavoidable contract requirement before implementation.

## Required tests

1. Happy path displays the exact manifest, prompts once, signs four existing
   payloads, atomically advances four contiguous sequences, and returns the
   complete receipt.
2. Existing granular commands remain behavior-compatible.
3. Wrong passcode, missing signer, signer/key mismatch, and any constituent
   signing failure leave journal bytes unchanged.
4. Stale root, branch, HEAD, base, repository identity, journal sequence, or
   mission revision fails before mutation.
5. Malformed/hostile manifest input, duplicated or unsorted sets, and authority
   not shown in the manifest fail before prompting or mutation.
6. Invalid constituent entry or replay failure leaves journal bytes unchanged.
7. Dependency counters independently prove exactly one signer unlock and four
   signatures; injected failure at each signing index leaves bytes unchanged;
   direct `node:crypto.verify` proves every signature without production
   validators.
8. Temporary-file open/write/sync/stat/identity, original-journal drift,
   rename, directory-sync, reread, replay, cleanup, and lock-release faults
   produce deterministic fail-closed or `recovery_required` results.
9. Subprocess termination at every store stage plus an independent byte oracle
   proves the journal is exactly baseline or complete candidate, never a valid
   prefix of the four-entry transition.
10. Focused tests, full package tests, `git diff --check`, and package dry-run
   pass at the exact implementation revision.

## Stop condition

Stop after Mack validates and Fury performs exact-revision conformance review.
Publication may create one bounded draft PR only under separate exact
`review.publish` authority. Do not mark ready, merge, deploy, release, enter
the Jira adapter chain, or fabricate Fitz/Coulson acceptance.
