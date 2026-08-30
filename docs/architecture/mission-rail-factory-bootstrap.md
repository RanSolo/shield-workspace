# Factory bootstrap — Mission Rail V1

Use this packet to start the construction program in Factory after the
architecture PR and dependency-ordered issues exist.

## Recommended surface

1. Open the repository at the accepted architecture revision.
2. Start Factory in Spec Mode.
3. Provide the prompt below and allow read-only repository/GitHub/Nx context.
4. Compare Factory's proposed features, dependencies, milestones, validators,
   and owned paths with the accepted issue graph.
5. Resolve material differences before approving Mission Mode.
6. Record Epic Wheels Up for the accepted feature graph and envelope.
7. Select the organization-approved autonomy level. Medium is sufficient for
   local edits, builds, tests, and commits; High may be needed for branch pushes
   and draft PR publication when policy permits it.

## Spec Mode prompt

```text
Plan the Mission Rail V1 construction program defined in
docs/architecture/mission-rail-v1.md and
docs/architecture/mission-rail-v1.manifest.json.

This is Track-Layer construction. Build the new rail through ordinary Git, Nx,
review, and pull-request controls. Do not require the existing SHIELD mission
runtime to govern its own replacement. Do not delete or rewrite the existing
runtime.

Treat the machine manifest as the sole accepted feature and dependency graph.
Generate or reconcile one GitHub delivery issue from each manifest feature ID;
an issue may not change the accepted graph. Preserve the
declared dependency order, owned paths, reusable legacy sources, exclusions,
Nx validation commands, required artifacts, and terminal handoff. Parallelize
only issues with disjoint owned paths and settled upstream contracts.

Use three validation milestones: Foundation, Lifecycle, and Vertical flight.
At every milestone, bind validation to the exact candidate revision. Use normal
Nx caching and focused or affected targets; do not default to cache bypass or a
workspace-wide test run.

Before asking for GO, return:
- the feature and dependency graph;
- milestone boundaries and validator assignments;
- every proposed branch and owned path;
- exact validation commands;
- expected worker and validator run count;
- material assumptions or contradictions;
- the selected autonomy envelope and every action still requiring a human.

After GO, continue autonomously through draft PRs. Stop only for a material
architecture/scope change, missing external capability or credentials,
contradictory evidence without a deterministic recovery, or an unauthorized
merge/deployment/release/destructive effect.

GO applies to the complete accepted Track-Layer epic, not independently to each
feature. Cycle through ready features and bounded corrections without requesting
another PIN. Review at milestone boundaries and perform full Guided Code Review
and visible Guided QA at epic completion.
```

## Factory feature packet contract

Factory may elaborate an issue into subtasks, but it must preserve this packet:

```yaml
outcome: one externally verifiable result
architecture_source: accepted document path and commit
issue_ref: immutable manifest feature identity
exact_base: current accepted base revision
exact_base_derivation: terminal accepted integration receipt
depends_on: accepted issue or artifact identifiers
owned_paths: disjoint repository-relative paths
legacy_sources: source paths and commits allowed for surgical extraction
required_behavior: closed acceptance criteria
excluded_behavior: behavior not part of the feature
excluded_effects: effects not authorized
factory:
  mode: mission
  milestone: Foundation | Lifecycle | Vertical flight
  autonomy: bounded by project and organization policy
  parallelism: none | allowed after named dependency
validation: exact Nx commands with cache enabled
required_artifacts: code, tests, reports, and receipts required at completion
handoff:
  kind: feature | milestone | terminal_review
  target: exact accepted identifier
```

`tools/mission-rail/verify-packets.mjs` materializes each packet by applying
`featurePacketDefaults` and then its feature record. It rejects missing or
unknown fields. Every materialized packet therefore contains architecture
source, manifest issue reference, exact-base derivation, excluded behavior and
effects, Factory envelope, required artifacts, and a typed handoff even when a
value is shared program-wide.

Materialization derives `outcome` from the feature title, resolves `exactBase`
from the terminal integration receipt's candidate tree, and copies the feature
milestone into `factory.milestone`. The canonical packet digest binds the
manifest digest and integration-receipt digest. MR-000 uses the genesis receipt
emitted by Epic Wheels Up; later features use the latest accepted receipt.

## Specialist mapping

Factory project Droids should preserve these responsibilities:

- Hill: Mission orchestration, issue dependency graph, scope, and exceptions.
- Daisy: read-only legacy audit, source mapping, and evidence gathering.
- Fury: exact architecture and conformance review; no implementation writes.
- May: bounded implementation inside one feature's owned paths.
- Mack: independent exact-revision Nx validation and evidence.

Use fresh-context custom Droids for focused specialist work. Keep Mission
orchestration and cross-feature state in the parent Mission rather than asking
specialists to coordinate through chat memory.

## Completion packet

Factory reports the following for every feature:

```text
Issue and feature ID
Base and exact candidate revision
Changed paths compared with owned paths
Nx commands, exit status, and cache status
Legacy source reused, simplified, replaced, dropped, or deferred
Review and validation dispositions
Draft PR or explicit archive reference
Downstream feature unblocked
```

A feature is not complete merely because its worker stopped or tests passed.
Its changes must be committed and handed to the next feature, published as a
draft PR, or explicitly archived.
