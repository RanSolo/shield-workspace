# Issue #279 — publication authorization idempotency plan

## Frozen identity and scope

- Mission: `mission:issue-279`
- Subject: `github:RanSolo/shield-workspace/issue/279`
- Base and planning parent: reconciled onto refreshed `origin/main` at
  `6958dba9ed287069b286b9f0f01d889ff600938f`
- Required dependency: merged #286/#291 commit
  `984c9a5eaa6b054111a2f2d69fbef039c805792d`, an ancestor of this base.
- The existing `f14972e` plan is historical input only; this corrective plan
  is reconciled against the merged prepared-publication contracts.
- Branch: `agent/issue-279-publication-idempotency-reconciled`
- Blocks: #278 publication, then #226 and #162 continuation
- Authority state: planning only. May must not edit implementation paths until
  Fury approves this exact plan revision and Coulson grants fresh exact Wheels
  Up authority.

The implementation is exactly three dependency-ordered packets, one issue
acceptance criterion per packet. Each packet receives only its listed paths and
ends in a clean coherent checkpoint commit.

## Reconciliation with merged #286

#286 owns normal prepared-publication first authorization and unchanged retry
through `mission-preparation-host-v1`, `review-publication-executor-v1`, and
the updated CLI/tests. #279 must not duplicate that preparation/retry path or
change its result union. The remaining legacy surface is the direct caller-
supplied `publication-authorize` input, plus sealed v8/v9 journals and the
downstream publication request/result adapters. A #286-prepared result is
accepted as an existing canonical request/effect input; it is never converted
back into a new authorization.

The original plan was bound to `5684446`; after the upstream rebase, the
reconciled plan is bound to `6958dba`: #286's prepared
publication host and executor tests are present; direct `publication-authorize`
still derives a fresh sequence-bound authorization before semantic comparison;
profile-aware replay currently requires one authorization record per ID;
publication request/result binding resolves by raw authorization/request IDs;
and delivery workspace recovery already has an existing-draft path that must
remain execute-once. No implementation claim is made by this plan.

The compatibility matrix is closed:

| Input/history | Expected #279 behavior |
|---|---|
| normal #286 prepared publication | preserve existing prepared result and retry semantics; no duplicate authorization |
| legacy direct `publication-authorize`, first call | existing Coulson/sign/freshness/append path, exactly one new authority |
| direct retry with equivalent meaning fields | return the canonical authority without prompt/sign/append |
| equivalent sealed v8/v9 duplicates | project one deterministic canonical authority and immutable aliases |
| non-equivalent unlinked or consumed conflict | fail closed with one actionable reason |
| canonical request/result/draft retry | return existing chain and perform no second push or draft creation |

The canonical legacy representative fixture is synthetic and disposable; no
live #278 journal is edited, replayed, or published.

## Deterministic recovery rule

A validated publication authority has a canonical semantic identity computed
from every authority-meaning field except the sequence-derived
`authorityRef`. Signature bytes, authorization/entry IDs, journal sequence,
timestamp, source reference, and the existing sequence-bound authority digest
remain immutable provenance but do not alter semantic identity.

During replay, the first verified record for one semantic identity is that
class's canonical record. Later verified equivalent records are immutable
historical aliases and do not create another current authority. A later
non-equivalent authority can replace the prior class only as a fully verified,
contiguous Coulson-signed authorization transition using the existing
`previousJournalSequence` lineage and only before any publication request has
consumed the prior class. This is explicit signed supersession, not caller
choice or latest-entry preference. A non-equivalent record without that exact
lineage, or one competing with a queued/delivered request, blocks replay.

The current projection exposes exactly one canonical authority record plus its
semantic identity and immutable alias provenance. Requests and results bind
only the canonical record. For #278, sequence 4 is the earlier planning-HEAD
class explicitly superseded by the first exact implementation-HEAD class at
sequence 5; equivalent sequences 6 and 7 become aliases of sequence 5. Sealed
journal bytes are never changed or deleted.

## Packet A — AC-1 semantic authorization identity

- Acceptance criterion: issue #279 `AC-1` only.
- Requirement/finding: sequence-bound references and signatures currently make
  equivalent authority records appear distinct because only the complete
  authority digest exists.
- Intended invariant: one closed, canonical, immutable semantic identity covers
  authority kind, mission/subject/revision, repository/root, branch,
  base/HEAD, ordered paths, and ordered effects while excluding only
  provenance fields that cannot change authority meaning.
- Exact minimal paths:
  - `packages/shield-team-system/src/review-publication-v1.mts`
  - `packages/shield-team-system/src/mission-preparation-host-v1.mts`
  - `packages/shield-team-system/tests/review-publication-v1.test.mjs`
  - `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- Required existing interfaces: `validateReviewPublicationAuthorityV1`,
  `computeReviewPublicationAuthorityDigest`,
  `projectPreparedReviewPublicationSemanticTupleV1`, and canonical path/effect
  validation. `review-publication-v1.mts` becomes the one shared semantic-
  identity implementation; the existing #286 prepared helper delegates to it.
  The identity includes `publicationScopeSchemaVersion` and
  `contractVersion`, and excludes only validated `authorityRef`.
- Allowed effects: add a public deterministic semantic-identity function and
  closed result/material type within the existing `review-publication.v1`
  contract; do not replace the existing sequence-bound authority digest.
- TDD: selected. Red must prove equivalent authorities differing only in
  `authorityRef` have one identity, every meaning-field change differs, and
  hostile objects, accessors, proxies, sparse/duplicate/aliased paths,
  malformed records, and reordered sets fail closed.
- Focused validation:

  ```text
  npm run build --workspace @shield/team-system
  node --test packages/shield-team-system/tests/review-publication-v1.test.mjs
  node --test packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs
  git diff --check
  ```

- Expected output: semantic identity is stable and authority digest behavior is
  unchanged.
- Stop conditions: changing authority meaning, accepting noncanonical inputs,
  weakening path/effect checks, adding an authority class, or requiring journal
  or CLI changes in this packet.
- Successor: Packet B from the accepted clean Packet A commit.

## Packet B — AC-2 idempotent publication-authorize command

- Acceptance criterion: issue #279 `AC-2` only.
- Requirement/finding: `publicationAuthorize(...)` derives a new sequence-bound
  authorization before checking semantic equivalence, so retries prompt and
  append again.
- Intended invariant: after exact repository observation and replay, an
  unchanged command whose semantic identity matches the canonical current
  authority returns `ALREADY AUTHORIZED — nothing repeated.` without prompting,
  signing, appending, or changing any request/effect state. The first command
  still prompts and appends exactly once.
- Exact minimal paths:
  - `packages/shield-team-system/src/review-publication-executor-v1.mts`
  - `packages/shield-team-system/src/mission-cli.mts`
  - `packages/shield-team-system/tests/review-publication-executor-v1.test.mjs`
  - `packages/shield-team-system/tests/supervised-cli.test.mjs`
- Required existing interfaces: Packet A semantic identity,
  `observePublicationRepository`, profile-aware journal replay, signer batch,
  freshness checks, and atomic append.
- Allowed effects: add the pre-sign semantic-idempotency branch in the shared
  executor after validated replay/repository observation but before signer
  snapshot, PIN, signing, and append. The branch is for `mode === "legacy"`
  only; normal #286 prepared mode is unchanged. `mission-cli.mts` is limited
  to stable human/JSON rendering. Returned JSON may identify the exact
  canonical existing record but may expose no passcode or signer-private
  material.
- TDD: selected. Red covers first PIN, immediate and reload retry, no-stdin
  idempotent retry, cancellation, wrong PIN, signer failure, interruption,
  repository/config/journal drift, conflicting intent, and zero partial append.
- Focused validation:

  ```text
  npm run build --workspace @shield/team-system
  node --test --test-name-pattern='publication-authorize|ALREADY AUTHORIZED' packages/shield-team-system/tests/supervised-cli.test.mjs
  node --test packages/shield-team-system/tests/review-publication-executor-v1.test.mjs
  git diff --check
  ```

- Expected output: one authorization entry and one meaningful decision for
  equivalent retries; conflicts remain `NOT AUTHORIZED` with one actionable
  reason.
- Stop conditions: any passcode persistence/echo, bypass of repository
  observation or signer/freshness checks on first authorization, journal
  rewrite, request creation, or edit outside the listed Packet B paths.
- Successor: Packet C from the accepted clean Packet B commit.

## Packet C — AC-3 legacy recovery and execute-once publication

- Acceptance criterion: issue #279 `AC-3` only.
- Requirement/finding: v9 replay retains all unique sequence-bound authority
  IDs, while request/result creation matches only raw IDs; legacy v8 has the
  same identity-only behavior. Equivalent duplicate history therefore lacks a
  unique semantic current authority.
- Intended invariant: replay applies the frozen deterministic recovery rule,
  retains immutable alias provenance, projects exactly one current canonical
  authority, and binds exactly one queued request/result/effect chain to it.
  Reload/retry returns the existing request/effect and cannot push or create a
  second draft. Non-equivalent unlinked or consumed-state conflicts fail
  closed.
- Exact minimal paths:
  - `packages/shield-team-system/src/profile-aware-mission-v1.mts`
  - `packages/shield-team-system/src/mission-v2.mts`
  - `packages/shield-team-system/src/mission-cli.mts`
  - `packages/shield-team-system/github/publication-gate.mjs`
  - `packages/shield-team-system/github/delivery-workspace.mjs`
  - `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`
  - `packages/shield-team-system/tests/mission-v2.test.mjs`
  - `packages/shield-team-system/tests/supervised-cli.test.mjs`
  - `packages/shield-team-system/tests/fixtures/review-publication-journal.mjs`
  - `packages/shield-team-system/tests/delivery-workspace.test.mjs`
- Required existing interfaces: Packet A identity, Packet B idempotent command,
  append-only v8/v9 replay, adapter-v2 request/result binding, publication gate,
  and Delivery Workspace existing-draft execute-once recovery.
- Allowed effects: add semantic current/alias projection and canonical request
  binding; preserve every sealed entry and existing sequence-bound identity.
  Extend fixtures with synthetic equivalents of #278 sequences 4–7. No live
  #278 journal or external GitHub operation occurs in this packet.
- TDD: selected. Red reproduces the old planning authority plus three
  equivalent exact-HEAD records, proves sequence-5 canonical recovery and
  sequence-6/7 aliases, one request and one delivered/resumed draft, restart
  stability, repeated request/effect rejection, non-equivalent conflict, stale
  or malformed lineage, mixed v8/v9 rejection, and unambiguous legacy
  compatibility.
- Focused validation:

  ```text
  npm run build --workspace @shield/team-system
  node --test packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs
  node --test packages/shield-team-system/tests/mission-v2.test.mjs
  node --test packages/shield-team-system/tests/supervised-cli.test.mjs
  node --test packages/shield-team-system/tests/delivery-workspace.test.mjs
  git diff --check
  ```

- Expected output: the untouched #278-equivalent journal deterministically
  yields one current semantic authority, one exact request, and at most one
  publication effect.
- Stop conditions: journal rewrite/deletion, generic latest-wins selection,
  caller-selected canonical authority, weakening exact binding/freshness,
  changing adapter or authority classes, or needing a path outside this packet.
- Successor: cumulative exact-head Mack validation, then Fury conformance.

## Traceability and cumulative validation

| Issue AC | Plan packet | Disposition target | Exact proof |
| --- | --- | --- | --- |
| AC-1 | Packet A | `implemented_and_proven` | semantic identity contract suite |
| AC-2 | Packet B | `implemented_and_proven` | CLI first/retry/failure suite |
| AC-3 | Packet C | `implemented_and_proven` | v8/v9 replay, #278 legacy fixture, and execute-once integration suite |

Mack validates the exact clean implementation revision independently:

```text
npm exec -- nx run @shield/team-system:test --skipNxCache
git diff --check
```

Mack also reruns every packet's focused commands, verifies exact ancestry and
per-packet path scope, and retains FAIL for any environment or product failure.
Fury then reviews that exact HEAD for architecture, scope, immutable-history,
authority, passcode, and execute-once conformance.

## Exclusions and terminal condition

No journal rewrite/deletion, passcode handling expansion, new authority class,
weakened path/revision/effect/signer/freshness check, generic latest-wins rule,
live #278 publication, #278/#226 worktree edit, PR update/ready transition,
merge, deployment, release, destructive cleanup, or final acceptance is
permitted. After Mack and Fury pass, publication of #279 itself requires
separate exact-head authority. Only after #279 merges may Alpha replay the
untouched #278 journal and continue its execute-once publication path.
