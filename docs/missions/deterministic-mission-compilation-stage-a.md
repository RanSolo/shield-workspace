# Deterministic Mission Compilation Micro-Experiment — Stage A

Status: Wheels Up for Stage A construction only  
Authority: Coulson decision, 2026-07-21  
Stage B: conditionally authorized but blocked until the Stage A freeze gate passes

## Mission objective

Determine whether one validated, content-addressed May dispatch can be
compiled into a deterministic runtime prompt without parsing Markdown,
creating authority, losing obligations, or obscuring provenance.

Stage A constructs and measures only the static compilation boundary. It does
not invoke a model, implement production integration, generalize the IR,
render for a second provider, or run the Stage B implementation replay.

## Historical fixture

- Repository: `RanSolo/shield-workspace`
- Mission: Issue #41 / Issue #59 Unicode conformance repair
- Base revision: `afdbf71b8ece2a2506a0b6a7b213267c7896f8d1`
- Historical accepted revision:
  `200251bb8730cad3f1e0e70d8830ce2d52c532ba`
- Accountable and owning seat: `may`
- Gate: `implementation-repair`
- Original boundary: the three implementation files already approved for the
  Issue #59 policy-parity slice

The control handoff is frozen byte-for-byte from the original Fury finding,
Coulson authorization, validation obligations, and output contract. The
structured fixture must be constructed from those governed source bytes with
a field-level source map. It must not be reconstructed from the accepted diff.

The accepted revision is an oracle for post-grading comparison only. Stage A
may bind its identity, but compiler and fixture construction code must not read
its contents.

## Approved implementation boundary

Stage A may add one isolated experimental package beneath:

`benchmarks/deterministic-mission-compilation/`

The package may contain:

- closed TypeScript contracts for `MissionDispatchIRV0` and the validated
  dispatch envelope;
- an experiment-only trusted-host validator;
- a minimal versioned instruction registry;
- one fixed `canonical-chat-v1` renderer;
- canonical serialization, domain-separated digest, provenance, manifest, and
  receipt verification helpers;
- the structured historical fixture and precise source map;
- Stage A unit, mutation, and fresh-process determinism tests;
- scripts that build and report the frozen experimental identities.

It must not change production exports, runtime routing, authority semantics,
permission enforcement, the Mission Journal, GitHub adapters, local brokers,
seat contracts, or runtime profiles.

## Responsibility boundaries

Hill assembles a candidate dispatch only from explicit governed facts. Every
non-mechanical selection is attributable and sealed before validation.

The trusted host validator proves freshness, ownership, authority
compatibility, artifact integrity, and internal consistency. Its receipt is
eligibility evidence only.

The compiler performs no reasoning or authority decision. It accepts one
immutable validated content bundle, rehashes the supplied bytes, verifies the
receipt, and renders deterministic output. It performs no Markdown,
filesystem, registry, environment, clock, locale, randomness, network,
process-state, or model lookup.

Current Coulson authority and governance state must be checked again by the
trusted host immediately before any future Stage B dispatch. Neither an IR,
validation receipt, replay identity, prompt, manifest, nor attestation grants
tool permission or mission authority.

## Stage A outputs

For one validated dispatch and target profile, compilation produces:

1. a byte-stable runtime prompt;
2. a complete, non-overlapping provenance map;
3. a deterministic compilation manifest.

Operational timestamps, issuance identifiers, signatures, and attestations
remain outside those outputs, but bind their deterministic digests.

## Construction and freeze sequence

1. Commit this Mission Brief and the frozen experimental protocol.
2. Publish and verify the draft Mission Workspace.
3. May owns the complete Stage A implementation.
4. Run construction tests until the candidate is ready to freeze.
5. Commit the complete compiler, validator, renderer, registry, fixture, and
   Stage A test source as the immutable source commit.
6. Build from that exact source commit in a clean environment and calculate
   source-tree, compiled-artifact, dependency-lock, renderer, registry,
   fixture, target-profile, rubric, and governance-contract digests.
7. Commit a freeze manifest that names the immutable source commit and all
   identities. The freeze manifest may not modify compiler inputs or source.
8. Run Stage A measurement against the exact frozen identities.
9. Hill verifies results and exact identity continuity.
10. Fury performs conformance review before the Stage B dispatch gate.

This two-commit sequence avoids asking a commit to contain its own identity.
Any source correction after step 7 creates a new candidate identity, discards
the prior measurements, and requires a complete Stage A restart and renewed
review.

## Stage A acceptance criteria

- No validator or compiler code parses, summarizes, or infers from Markdown.
- Candidate data is closed, typed, bounded, and traceable to governed source
  bytes or an explicit attributed Hill judgment.
- Unknown, duplicate, sparse, accessor-bearing, malformed, excessive, or
  unsafe values fail closed.
- Unicode is encoded as UTF-8 without normalization; unpaired surrogates fail.
- Digests use SHA-256 with frozen domain tags and length-delimited inputs.
- The trusted-host receipt is unforgeable in the experiment boundary and binds
  every frozen identity, governance head, trial, arm, replay, seat, owner,
  gate, repository, branch, commit, and tree.
- Missing, stale, expired, revoked, substituted, or cross-trial receipts fail
  with their exact expected reason.
- The compiler performs no post-validation content lookup.
- Every variable prompt span has complete and non-overlapping provenance.
- Repeated fresh-process compilation remains byte-identical across deliberately
  varied working directories, time zones, locales, environment ordering, and
  operational issuance metadata.
- Every mutation fails for its expected closed reason; unrelated exceptions
  are failures.
- Compiler, validator, renderer, registry, target, fixture, rubric,
  dependencies, and governance contract receive frozen identities.
- Production package tests remain green and no production surface changes.

## Outcome separation

`Governance Equivalent` is a future Stage B pass/fail outcome. It covers
authority preservation, safety gates, provenance, determinism, obligation
preservation, stale-state protection, and blocker precedence.

`Implementation Quality` is a separate observational Fitz score. It cannot
compensate for a governance failure.

Stage A reports only whether the deterministic compilation boundary and its
frozen identities pass. It does not claim governance equivalence before the
controlled runtime replay.

## Stop conditions

Stop and return to Coulson if implementation requires Markdown parsing,
production integration, a generalized IR, provider-specific semantic rewrite,
new authority semantics, shared Git-object isolation, accepted-solution
leakage, incomplete provenance, a receipt bypass, an unclosed dependency,
post-freeze source change, a rubric or fixture change, model invocation, scope
expansion, or a new human authority decision.

Any safety, authority, privacy, or attribution failure overrides performance,
token, time, or implementation-quality evidence.

