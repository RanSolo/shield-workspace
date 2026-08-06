# Issue #203 — One-passcode Wheels Up plan

## Frozen identity and boundary

- Mission: `mission:issue-203`
- Mission revision: `sha256:QNmv-sKt8qN-sFWOqoxn9RVhGmg2Gl0GEILGGkMaQnI`
- Repository: `RanSolo/shield-workspace`
- Base and planning revision: `0de32599f26ba38fb8a66f9868035f48a1644685`
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
3. `runtime.binding.recorded` May binding;
4. `review.publication.authorized` review publication authority.

Each constituent payload remains separately signed by the configured Coulson
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
- exact initial draft-publication paths and permitted effects.

Mission, subject, mission revision, repository, canonical root, branch, HEAD,
human binding, journal sequences, authority IDs, digests, timestamps, remaining
human gates, and exclusions are derived by the host. Unknown, inherited,
accessor-backed, symbolic, non-enumerable, proxy-backed, duplicated, unsorted,
or malformed input fails before prompting or appending.

Before requesting the passcode, render one closed manifest containing every
derived binding and requested authority plus explicit exclusions. Interactive
mode prints the human-readable manifest before `Passcode:`. JSON/stdin mode
prints one deterministic machine-readable preview without contaminating the
final receipt output contract.

The initial publication authority is bound to the current clean planning HEAD
and its exact observed base-to-head paths. It authorizes only initial draft
publication. A later implementation-head update, ready-for-review transition,
merge, deployment, release, or final acceptance remains separately gated.

## One signer unlock, four signatures

Add a signer helper that unlocks and verifies the configured private key once,
signs an ordered closed list of constituent payloads, and releases the key
without retaining a reusable signer session. It returns one signature per
payload in order. Any unlock, key-reference, payload, or signing failure
returns no signatures to the caller and performs no journal write.

The CLI builds the four entries sequentially in memory. After each entry is
constructed, replay the candidate entry list to derive the exact projection
required by the next existing constructor. No constructor may accept a
caller-asserted sequence or authority that disagrees with replay.

## Atomic journal transition

Add a schema-9 multi-entry store operation. Under the existing per-mission
lock, it must:

1. snapshot and validate a non-empty ordered entry list;
2. reread the current journal and require the first sequence to equal current
   sequence plus one and every later sequence to be contiguous;
3. replay the complete candidate journal before writing;
4. write the complete candidate journal to a confined, exclusive, regular
   sibling temporary file with restrictive deterministic mode;
5. verify complete bytes, sync the temporary file, and revalidate live lock,
   journal identity, and unchanged original bytes;
6. atomically rename the complete candidate over the journal;
7. sync the parent directory, reread exact bytes, and replay the result;
8. return the final projection and exact receipt only after lock release is
   proven.

No multi-line append is permitted: a short append could end on a valid entry
boundary and expose partial usable authority. Before rename, every failure
leaves the original journal current. Failure after an uncertain rename or
directory sync returns `recovery_required`; callers must inspect replay and
must not retry blindly. Temporary-file identity drift, symlinks, gitlinks,
short writes, sync failures, rename failures, readback mismatch, and cleanup
uncertainty fail closed.

## Freshness and no-expansion checks

Immediately after signing and immediately before the atomic store operation,
re-read and canonical-compare:

- repository configuration and configured journal path;
- canonical root, Git top-level, origin repository identity, attached branch,
  base ancestry, HEAD, clean status, exact changed paths, symlink paths, and
  gitlink paths;
- mission journal bytes, sequence, mission revision, pending authorization,
  and absence of current implementation/binding/publication records;
- every displayed manifest field and every derived constituent payload.

Any mismatch returns before journal mutation. The batch may contain no field,
path, effect, capability, identity, or authority not present in the displayed
manifest or host-derived fixed fields.

## Receipt

After exact durable readback, return one closed receipt containing:

- mission, subject, mission revision, repository, root, branch, base, and HEAD;
- evaluated starting and ending journal sequences;
- IDs and digests for all four constituent signed records;
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
- this brief and plan

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
7. Temporary-file open/write/sync/stat/identity, original-journal drift,
   rename, directory-sync, reread, replay, cleanup, and lock-release faults
   produce deterministic fail-closed or `recovery_required` results.
8. Crash-window tests prove no prefix of the four-entry transition can become
   a valid current authority state.
9. Focused tests, full package tests, `git diff --check`, and package dry-run
   pass at the exact implementation revision.

## Stop condition

Stop after Mack validates and Fury performs exact-revision conformance review.
Publication may create one bounded draft PR only under separate exact
`review.publish` authority. Do not mark ready, merge, deploy, release, enter
the Jira adapter chain, or fabricate Fitz/Coulson acceptance.
