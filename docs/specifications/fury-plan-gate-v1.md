# Fury Plan Gate v1

`fury.plan-gate.v1` is a pure, stateless, non-authoritative Delivery Mode veto.
It determines whether an exact May-owned implementation blueprint revision has
the required early Fury architecture evidence. Only a literal `eligible`
evaluation can contribute to `dispatch_ready`; it grants no authority.

## Sequence and ownership

The gate follows Coulson approval, the committed Mission Brief/May blueprint,
and verified draft PR creation. It precedes production implementation. May is
the sole blueprint and implementation owner. The evaluator derives Fury as the
reviewer and Hill as the reconciliation verifier; caller-supplied seat claims
are not accepted. Final Fury exact-head conformance, human Fitz review, and
Coulson merge authority remain separate later gates.

For Phase 1, the blueprint's repository-relative `artifactPath` must exactly
equal `workspacePlan.missionBriefPath`. Existing publication checks establish
that this combined artifact is clean, tracked, committed, and bound to the
verified PR head. Artifact identity, path, ownership, review, reconciliation,
runtime, and executor values remain trusted-host assertions rather than proof
of content, authorship, or actor identity.

## Closed decisions

The review verdict is `PASS`, `PASS_WITH_REQUIRED_CHANGES`, or `FAIL`. `PASS`
has no findings. The other verdicts require 1-16 uniquely identified findings
from the closed classes exported by `@shield/team-system/github`. A finding has
one class and 1-8 unique opaque evidence references.

`PASS` is eligible only at its exact reviewed head. `FAIL` always denies.
`PASS_WITH_REQUIRED_CHANGES` requires one reconciliation whose corrected head
differs from the reviewed head, whose `additionalArchitectureChange` is
literally false, and whose incorporated disposition IDs exactly equal the
review finding IDs. Any additional or unprescribed architecture, scope,
authority, mission, subject, artifact, ownership, workspace-identity, or
unrelated design change requires a new Fury review.

## Exact binding and bounds

Review and reconciliation bind mission, subject, repository owner/name, base
branch, mission branch, PR number, artifact ID/path/kind, May ownership, review
ID where applicable, and immutable 40-64 character lowercase hexadecimal
revisions. Identifiers are closed ASCII values of at most 128 UTF-8 bytes.
Paths are relative, at most 512 bytes, and reject absolute, backslash, empty,
dot, traversal, control-byte, and percent-encoded ambiguity. PR numbers are
positive safe integers no greater than 2,147,483,647. Evidence references are
at most 256 bytes, eight per record and 64 across a gate.

Records are exact plain own-data-property objects. Arrays are dense native
arrays without extra properties. Unknown or inherited fields, accessors,
symbols, non-plain prototypes, sparse arrays, excessive values, unsupported
versions, and reflective failures fail closed without echoing input.

## Trust and replay boundary

The trusted orchestrating host constructs the expected binding from configured
mission assertions and the verified receipt, supplies host-asserted review and
reconciliation evidence, asserts the absence of additional unprescribed
change, and enforces the mission-wide correction cap.

The evaluator is deterministic and stateless. Contextual exact-binding and
revision staleness are the complete v1 replay boundary. Same-binding reuse is
idempotent. The evaluator cannot enforce global ID uniqueness, durable
consumption, cross-process replay detection, semantic diff classification,
authenticated provenance, or a correction cap across calls. If any capability
is required, implementation stops and returns to Coulson.

## Delivery result

The guard descriptor-safely normalizes the outer input, workspace plan,
blueprint assertion, and any non-null plan gate before a Git or GitHub command.
Malformed input is `blocked` with no commands. Literal `planGate: null` is the
only pending-review form; it permits early verified workspace publication and
returns `workspace_ready` with `PLAN_REVIEW_REQUIRED`.

After unchanged draft-PR publication and receipt validation, a pending, failed,
stale, mismatched, or incompletely reconciled gate returns `workspace_ready`.
Only an exact eligible gate returns `dispatch_ready`. Callers must compare the
state literally and must never treat a generic non-blocked result as dispatch
permission.

The contract does not change PR publication mechanics, Mission Journal or
Kernel state, permissions, authority, runtime profiles, merge, deployment,
release, or production systems.
