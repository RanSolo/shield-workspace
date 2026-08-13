# Issue #276 — improvement-intake contract and bounded dogfood

Status: planning/recon only; collection is **incomplete**. This revision creates
no production implementation, issue, plugin, authority, merge, deployment, or
release.

## Revision and evidence boundary

- Repository: `RanSolo/shield-workspace`.
- Baseline: `d3f29002fe6c249152763815a633132589b5a9b1`.
- Referenced sibling correction: `8a2edc1999b1b6eef6e723d1423262cccd5b8382`.
- Evidence HEAD (historical dogfood run): `ee3de17b18690b14c5137d555ff03e152369b145`.
- Prior reviewed revision and correction base:
  `3685b20f835fa6f8256a42e19a4cbcacbe4c8fae`.
- Current reviewed revision: an external review-envelope field named
  `reviewedHead`. It must equal the repository's exact `HEAD` when review
  begins and throughout review. This report intentionally does not embed its
  own resulting commit hash, which would be self-referential.
- Target-main reference at reconciliation: `8f9e8e79cb4c1bec284e690a09d0c01456854e0b`.
- Historical artifact semantic digest: `6159f18f319e2815f17e4fa323afd70edf1ff1285fa42a39ba9d20e9fc869840`.
- The ignored dogfood artifact binds its evidence to `evidence HEAD`; it is
  historical evidence, is outside authorized publication scope, and is not a
  current-target claim. Its candidate rows, IDs, row digests, and semantic
  digest are not recomputed by this report. A fresh exact-head evidence run
  must recompute them after target alignment, with the churn window ending at
  that run's exact evidence HEAD.
- Collection focus, in canonical order: `boundaries`, `build`, `lint`, `test`.
- Candidate budget: `3`.
- The two pre-existing tracked changes in `.codex/agents/daisy.toml` and
  `.codex/agents/mack.toml` are evidence inputs only and are preserved.

Observed facts below come from the local artifact's successful probes.
Recommendations and unresolved evidence are labeled separately. Historical
issue text and prompts are not current repository truth.

## Content-addressed artifact contract

The v1 artifact has four top-level members:

```text
schemaVersion: "shield/improve-codebase/v1"
digest: sha256(canonical(document with only the top-level digest omitted))
envelope: repository/base/head/dirty/focus/budget/status bindings
payload: bindings + probes + evidence rows + scoring + candidates + packets
```

Canonical JSON is UTF-8, has no insignificant whitespace, preserves JSON array
order, sorts object keys by Unicode code-point order, rejects duplicate keys,
and permits only JSON null/boolean/string and safe integers. Floats, NaN,
Infinity, timestamps, absolute host paths, and authority claims are forbidden.
The digest covers the complete semantic document, including the envelope,
payload, all probe commands/results, scoring rules, candidates, and packets;
only the top-level `digest` member is omitted. A sidecar contains that semantic
digest and artifact filename, but never substitutes for recomputation.

`envelope` and `payload.bindings` must be deeply equal after canonicalization.
They bind:

- repository slug, baseline, exact HEAD, and branch;
- clean boolean plus every dirty path, with Git blob SHA-1, file SHA-256, and
  normalized per-path diff SHA-256;
- ordered focus, candidate budget, and collection status.

Every probe records a stable ID, normalized command, working directory,
environment policy, exit classification, result SHA-256, and row digest. Every
evidence and candidate row records its own digest over the canonical row with
only `rowDigest` omitted. Source references are probe IDs, never prose-only
attribution.

Verification order is fixed:

1. Reject malformed/duplicate-key/non-canonical JSON and unknown schema.
2. Recompute the semantic digest and compare it to both `digest` and sidecar.
3. Require deep equality of `envelope` and `payload.bindings`.
4. Re-resolve repository, baseline, HEAD, branch, and dirty path/content/diff
   digests; reject missing, extra, stale, or reordered dirty rows.
5. Recompute every probe, evidence, and candidate row digest; reject dangling
   source IDs, duplicate stable IDs, unknown kinds, or non-total ordering.
6. Require every contract probe exactly once. Failed or absent evidence remains
   explicit. `complete` is legal only when all required probes succeeded.

Any failure stops consumption with `Insufficient evidence`; partial evidence is
never promoted to a complete artifact or silently omitted.

## Probe ledger and observed repository facts

The local dogfood artifact records every source command and output digest. Its
required probe ledger covers revision/dirty state, resolved Nx projects, each
resolved project, graph, manifests/exports, affected selection, source size,
tests/fixtures, Git churn, environment prerequisites, uncached timing, cached
timing, and complete import/consumer attribution.

Observed:

- Nx version is `23.1.0`; `nx show projects --json` resolves exactly three
  projects.
- `nx show project` reports `projectType: null` for all three projects. The
  repository roles below are separately derived, not presented as Nx
  `projectType`: package roots plus public manifests yield `package-library`;
  an app root plus a private manifest yields `private-application`. Nx graph
  node `type` is retained as a separate observation.
- `@shield/mission-preparation`: root `packages/mission-preparation`, Nx graph
  node type `lib`, derived role `package-library`, one export, and
  build/test/pretest/prepack targets.
- `@shield/team-system`: root `packages/shield-team-system`, Nx graph node type
  `lib`, derived role `package-library`, 34 exports, and
  build/test/pretest/prepack targets.
- `@shield/multiband`: root `apps/multiband`, Nx graph node type `app`, derived
  role `private-application`, and build/test/pformat/dev/db:push/prebuild/
  format:write/format/start/lint targets.
- All resolved targets use `nx:run-script`. Build and test are cache-enabled;
  no project exposes a `typecheck` target; neither package exposes `lint`.
- The graph has one static edge: `@shield/multiband` to
  `@shield/team-system`. The app manifest independently declares the same
  package consumer. No edge connects the two packages.
- A deterministic extension-based count, excluding `node_modules` and `dist`,
  reports 547 lines for mission-preparation, 55,336 for team-system, and 6,338
  for multiband. Size is only a signal.
- `HEAD..HEAD` yields an empty affected set. This is an empty-change negative
  control, not representative-change evidence.
- The baseline-to-input-HEAD churn probe reports zero additions/deletions under
  `packages/` and `apps/`; the only committed change was this report. This does
  not establish historical hotspot churn.
- An isolated uncached `@shield/team-system:test` run passed 1,253/1,253 tests;
  Nx critical path was 21.3 s. An isolated mission-preparation build measured
  486 ms uncached critical path and 4 ms cached critical path with 1/1 cache
  hit. Durations are observations from this host, not portable promises.
- `POSTGRES_PRISMA_URL` is a documented multiband prerequisite. Timing probes
  use disposable Nx/npm state so shared-cache permission failures remain
  environmental and cannot become product candidates.

Unresolved evidence, therefore collection status `incomplete`:

- no complete parser-based import, fan-in/fan-out, export-consumer, test-owner,
  or fixture-coupling attribution for internal team-system domains;
- no representative-change affected graph;
- no historical churn window with meaningful product changes;
- no uncached/cached baseline for the proposed lint/typecheck targets because
  those targets do not exist.

## Deterministic ranking semantics

The immutable v1 `candidateKind` enum is `focused-target` or
`internal-boundary`. It is separate from the immutable v1 `dispositionKind`
enum: `Extract library`, `Add focused target`, `Split internally`, `Leave in
place`, or `Insufficient evidence`. A candidate stable ID is
`sha256(canonical({candidateKind, project, canonicalPath, scope}))`, where
canonical JSON has the rules above and `canonicalPath` is repository-relative.
Every field is a non-empty string; paths reject control characters,
backslashes, `.` segments, and `..` segments. IDs are never constructed by
delimiter concatenation.

Each component is an integer in `[0,100]` or `null` when evidence is absent.
`round` means nearest integer, with exact half values rounded upward; all
intermediate arithmetic is rational and rounded only at the named formula.
The applicability matrix is closed: targetGap applies to build/test/lint/
typecheck candidates; boundarySignal applies to package-boundary candidates;
validationSignal applies to every candidate, but fixtureCoupling is `null` for
focused-target candidates; consumerSignal requires complete attribution; and
churnSignal requires a representative local history window. A null component
is excluded from coverage and contributes zero to score.

- `targetGap = round(100 * missingWeight / applicableWeight)`, with build 25,
  test 30, lint 25, and typecheck 20; a target is missing only after resolved
  target inspection.
- `boundarySignal = round(40*publicPackage + 30*min(exports,10)/10 +
  30*min(attributedExternalConsumers,3)/3)`.
- `validationSignal = round(50*fullSuiteOver10s +
  30*missingFocusedValidation + 20*fixtureCouplingObserved)`; the fixture term
  is inapplicable to a target-only candidate and is required for a split.
- `consumerSignal = round(60*min(attributedExternalConsumers,3)/3 +
  40*min(attributedInternalConsumers,10)/10)`; null unless attribution is
  complete for the candidate scope.
- `churnSignal = min(100, round(100*changedLines/max(1,scopeLines)))`; null when
  the declared history window has no representative product changes.

Weights are target gap 30, boundary 25, validation 20, consumers 15, churn 10.
`score = nearestHalfUp(sum(weight*component/100))`; `coverage = sum(weight for
non-null components)`. The closed unresolved-evidence taxonomy is
`absent-required-probe`, `partial-required-probe`, `environmental-failure`,
`unresolved-dynamic-reference`, and `unrepresentative-history`. Only the first,
second, fourth, and fifth count as unresolved critical evidence for a candidate;
environmental failure is critical only when it blocks that candidate's required
probe. `uncertainty = min(100, 100 - coverage + 10*unresolvedCriticalCount)`;
`confidence = max(0, coverage - 10*unresolvedCriticalCount)`.

Risk is the sum of four components. Each component uses exactly one mutually
exclusive, exhaustive class:

- `reversibility`: `0` for read-only work with no output change; `5` for
  exactly one config/target addition reversible by one-file revert; `15` for
  every other fully reversible change; `25` when irreversible or unresolved.
- `publicApiMovement`: `0` when complete evidence or an explicit sketch
  constraint keeps exports unchanged; `10` for additive-only exports; `25`
  for any removal/rename or unresolved API effect.
- `dependencyFanout`: `0` when no consumer requires migration; `5` when one to
  three require migration; `15` when four to ten require migration; `25` when
  more than ten require migration or attribution is incomplete.
- `migrationBreadth`: `0` for read-only/no-output work or exactly one target in
  one project; `10` for changes elsewhere in exactly one project; `15` for
  more than one but fewer than all projects; `25` for workspace-wide or
  unresolved breadth.

Every value cites a source evidence row or an explicit sketch constraint;
otherwise it takes that component's unresolved class. Size alone is never a
risk basis.

The allowed disposition/actionability mapping is closed: `Extract library`,
`Add focused target`, and `Split internally` may be actionable only after a
fresh exact-head run succeeds for every candidate-required probe, leaves no
critical unresolved evidence, and deterministically recomputes all rows,
digests, IDs, scores, risks, and ordering. `Leave in place` and `Insufficient
evidence` are never actionable. Ordering is total and stable: actionable
before non-actionable; risk ascending; confidence descending; score descending;
then stable ID, `candidateKind`, `dispositionKind`, project, canonical path, and
scope, all ascending by Unicode code point. The candidate budget truncates only
after sorting. Easy-win labeling never changes order.

## Historical dogfood candidate evidence

These rows describe the historical artifact at evidence HEAD
`ee3de17b18690b14c5137d555ff03e152369b145`. Their aliases are not canonical
stable IDs, their displayed order is not a current deterministic ranking, and
all current dispositions remain `Insufficient evidence`.

| Historical alias | Disposition | targetGap | boundarySignal | validationSignal | consumerSignal | churnSignal | Score / coverage / confidence / uncertainty |
|---|---|---:|---:|---:|---:|---:|---|
| `internal-boundary/team-system` | Insufficient evidence | null (not applicable) | null (`p-attribution` partial) | null (`p-tests-fixtures` partial) | null (`p-attribution` partial) | null (`p-churn` unrepresentative) | 0 / 0 / 0 / 100 |
| `focused-target/team-system` | Insufficient evidence | 45 (`p-project-details`, resolved targets) | null (not applicable) | 80 (`p-team-test-uncached` over 10 s; `p-project-details` shows focused validation missing) | null (`p-attribution` partial) | null (`p-churn` unrepresentative) | 30 / 50 / 40 / 60 |
| `focused-target/mission-preparation` | Insufficient evidence | 45 (`p-project-details`, resolved targets) | null (not applicable) | 30 (`p-project-details` shows focused validation missing) | null (`p-attribution` partial) | null (`p-churn` unrepresentative) | 20 / 50 / 40 / 60 |

The corrected risk components and their bases are:

| Historical alias | Reversibility | Public API | Dependency fan-out | Migration breadth | Risk |
|---|---:|---:|---:|---:|---:|
| `internal-boundary/team-system` | 25 (no split/extraction sketch resolves reversibility) | 25 (`p-attribution` leaves API movement unresolved) | 25 (`p-attribution` is incomplete) | 10 (candidate scope is one project) | 85 |
| `focused-target/team-system` | 5 (sketch limits change to one target/config addition) | 0 (sketch forbids export changes) | 0 (sketch requires no consumer migration) | 0 (sketch is exactly one target) | 5 |
| `focused-target/mission-preparation` | 5 (sketch limits change to one target/config addition) | 0 (sketch forbids export changes) | 0 (sketch requires no consumer migration) | 0 (sketch is exactly one target) | 5 |

The internal-boundary risk is therefore supported by explicit component bases,
not inferred from size. It is deliberately not `Split internally`: broad
exports and size do not establish a boundary. Multiband remains the negative
control: its app-owned lint/format/lifecycle targets do not justify library
extraction. Deterministic IDs, row digests, risk values, and order are current
only when recomputed by the required fresh evidence run; this report does not
modify or republish the ignored artifact.

Candidate-specific required probes close actionability. `focused-target/team-
system` requires `p-project-details`, `p-graph`, `p-manifests`,
`p-team-test-uncached`, `p-environment`, and
`p-proposed-target-timings`; `focused-target/mission-preparation` requires
`p-project-details`, `p-manifests`, `p-mp-build-uncached`,
`p-mp-build-cached`, and `p-tests-fixtures`; `internal-boundary/team-system`
requires `p-project-details`, `p-manifests`, `p-attribution`, `p-tests-fixtures`,
`p-churn`, and `p-affected-representative`. The union of every listed set must
close in one fresh exact-head run before any implementation packet can be
created. The historical artifact has partial, absent, or stale probes in every
candidate path, so each current candidate is `Insufficient evidence`. P1-P3
below are non-authorizing sketches only, contingent on that gate and a
deterministic rescore selecting the corresponding candidate.

## Fresh-evidence gate and non-authorizing sketches

No implementation packet exists. P0 is the unsatisfied evidence gate. P1-P3
are unordered sketches retained only to describe possible follow-up evidence;
they are not plans, packets, authority, or a current implementation sequence.

### P0 — fresh exact-head evidence and deterministic rescore

- Revision/scope: rerun the complete required ledger against one externally
  bound exact HEAD, including the union of every candidate-required probe.
- Completion: every required probe succeeds, every candidate's required set
  closes, no critical unresolved evidence remains, and all rows, digests, IDs,
  scores, risks, and ordering are deterministically recomputed.
- Tests/evidence: closed row set, source digests, parser/version identity,
  unresolved dynamic imports, reproducible totals, and exact-head verification
  before and after collection.
- Rollback: discard ignored recon artifacts.
- Stops: ambiguous module resolution, generated-source contamination, or any
  required write.
- Effect: only a successful deterministic rescore may permit Hill to create a
  new exact-revision implementation packet; P0 itself grants no authority.

### P1 — team-system lint target sketch

- Contingency: usable only if P0's fresh rescore selects the corresponding
  focused-target candidate for actionability.
- Possible scope: one package-owned lint target and its declared Nx
  inputs/outputs only; no source cleanup or export changes.
- Tests: resolved target metadata; uncached run; second local-cache run; existing
  package build/test; affected graph for one representative package file.
- Rollback: revert only target/config additions and remove disposable caches.
- Stops: toolchain choice is ambiguous, baseline violations require broad code
  edits, target crosses package ownership, or environment blocks classification.

### P2 — team-system typecheck target sketch

- Contingency: usable only if P0's fresh rescore selects the corresponding
  focused-target candidate for actionability.
- Possible scope: one typecheck target proving a contract distinct from build;
  no compiler-policy or export changes.
- Tests: resolved metadata; command equivalence check against build; uncached
  and cached runs; package build/test; representative affected graph.
- Rollback/stops: revert only target/config additions; stop if it merely aliases
  build, expands compiler policy, or needs production edits.

### P3 — mission-preparation typecheck decision sketch

- Contingency: usable only if P0's fresh rescore selects the corresponding
  focused-target candidate for actionability.
- Possible scope: compare build and proposed typecheck contracts, then supply
  evidence for either one-target planning or `Leave in place`.
- Tests: command/diagnostic delta, resolved metadata, uncached/cached run if a
  distinct target is selected, package build/test, representative affected graph.
- Rollback/stops: revert only target/config additions; stop on no distinct
  contract, cross-package config changes, or production edits.

No internal split/extraction sketch exists. P0 must first close the required
evidence and rescore `internal-boundary/team-system`; `Insufficient evidence`
cannot authorize implementation.

## Before/after measurement schema

Any future authorized implementation packet would emit paired `before` and
`after` records at exact commits using identical host category, Node/npm/Nx
versions, environment prerequisite classification, change selector, target
set, cache directories, and repetition count. Each record contains:

- revision/base/head, dirty digests, candidate/packet ID, command digest, exit
  classification, and environmental/product failure class;
- affected project and task IDs in canonical order, graph edge set/digest, and
  false-positive/false-negative review notes;
- per task: uncached samples, median and p95 milliseconds, local-cache samples,
  cache hits/misses/hit ratio, critical path, and output digest;
- lint/typecheck/build/test coverage: eligible projects, covered projects,
  missing targets, files checked, tests pass/fail/skip, and diagnostics by code;
- boundary measures: exports, attributed consumers, fan-in/fan-out, dependency
  edges, test owners, fixture couplings, and unresolved dynamic references;
- process measures under #161: Hill interventions, Fury findings by severity,
  Mack validation findings, correction commits, changed lines, reverted lines,
  and rollback result.

Comparison records include absolute delta, percentage delta when denominator is
nonzero, confidence interval or sample spread, regression threshold, and an
`incomparableReason` when pairing invariants differ. Missing data remains null;
zero is never used for unknown.

## Reusable prompts

### Daisy evidence prompt

```text
Seat: Daisy. Read-only evidence collection only.
Collect shield/improve-codebase/v1 for ${repository} at exact base ${base} and
HEAD ${head}, focus ${focus}, budget ${budget}. Run every required probe once,
record normalized source commands/result digests and row digests, bind every
dirty path with content and diff digests, and classify failures as product,
environmental, or absent evidence. Do not rank, plan, edit, install, create
issues, or infer authority. Mark collection incomplete when any required
evidence is absent. Return only the artifact and sidecar.
```

### Hill planning prompt

```text
Seat: Hill. Planning only. Verify canonical JSON, semantic digest, sidecar,
envelope/payload equality, repository/base/HEAD/dirty bindings, every row
digest, required-probe closure, and collection status before interpretation.
On any failure, stop with Insufficient evidence. Consume supplied facts without
rediscovery. Apply the artifact's formulas and total ordering, return no more
than ${budget} candidates, and give each exactly one allowed disposition.
For each actionable candidate produce a dependency-ordered planning packet with
exact revision/scope, dependencies, tests, rollback, stops, paired measurement
schema, and a separate implementation-authority gate. Never turn incomplete
attribution, size, or an environmental failure into a boundary. Do not edit,
install, create issues, grant authority, merge, deploy, or release. Route the
exact ranked matrix and packets to Fury for a boundary challenge.
```

### Fury boundary challenge

```text
Seat: Fury. Technical review only. Verify the exact artifact digest, evidence
HEAD, external reviewedHead equality to repository HEAD, target-main reference,
candidate-required probe sets, rounding/applicability/risk/actionability rules,
and collision-safe stable IDs. Reject any actionable candidate whose required
probes are absent, partial, environmentally blocked, or stale. Challenge each seam for attributed
consumers/ownership, focused-target sufficiency, negative-control compliance,
uncertainty-driven disposition/order, and planning-only scope. Return PASS or
REVISE with exact findings; never grant human authority.
```

Fury's boundary challenge must independently test whether each proposed seam
has attributed consumers and ownership, whether a focused target is sufficient,
whether the negative control was respected, whether uncertainty changed the
disposition/order, and whether every packet remains planning-only. A Fury
technical verdict never supplies human authority.
