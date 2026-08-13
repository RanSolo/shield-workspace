# Issue #276 — improvement-intake contract and bounded dogfood

Status: planning/recon only; collection is **incomplete**. This revision creates
no production implementation, issue, plugin, authority, merge, deployment, or
release.

## Revision and evidence boundary

- Repository: `RanSolo/shield-workspace`.
- Baseline: `d3f29002fe6c249152763815a633132589b5a9b1`.
- Fury-revised report input: `b37bedbac345d844de2d6dda7cde9a8a724285ea`.
- The ignored dogfood artifact is regenerated after this report is committed;
  both its envelope and payload bind `head` to that correction commit.
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

Candidate stable ID is
`sha256(kind + "\n" + project + "\n" + canonicalPath + "\n" + scope)`. `kind`
is one allowed disposition token and `canonicalPath` is repository-relative.
Candidate IDs, kinds, projects, and paths participate in the final total
tie-breaker.

Each component is an integer in `[0,100]` or `null` when evidence is absent:

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
`score = round(sum(weight*component/100))`; null components contribute zero so
the score is a conservative lower bound. `coverage = sum(weight for non-null
components)`. `uncertainty = 100 - coverage + 10*unresolvedCriticalCount`,
capped at 100. `confidence = max(0, coverage - 10*unresolvedCriticalCount)`.
Risk components are reversibility, public-API movement, dependency fan-out,
and migration breadth, each integer 0–25; `risk` is their sum.

Ordering is total and stable: dependency tier ascending; actionable before
`Insufficient evidence`; risk ascending; confidence descending; score
descending; then stable ID, disposition kind, project, and canonical path,
all ascending by Unicode code point. The candidate budget truncates only after
sorting. Easy-win labeling never changes order.

## Dogfood candidate matrix

| Rank | Stable key | Disposition | Score / coverage | Confidence / risk / uncertainty | Conclusion |
|---:|---|---|---|---|---|
| 1 | `focused-target/team-system` | Add focused target | 66 / 75 | 75 / 20 / 25 | Components: target 100, boundary 80, validation 80, consumers/churn null. Actionable planning candidate: add separately owned lint and typecheck targets without export movement. |
| 2 | `focused-target/mission-preparation` | Add focused target | 47 / 75 | 65 / 15 / 35 | Components: target 100, boundary 43, validation 30, consumers/churn null. Actionable planning candidate: first prove typecheck is distinct from build; otherwise leave in place. |
| 3 | `internal-boundary/team-system` | Insufficient evidence | 0 / 0 | 0 / 55 / 100 | Boundary/validation/consumer/churn components are null. No split or extraction may be planned until complete import/consumer/test/fixture attribution exists. |

The artifact records component values and evidence-row references for each
score. Candidate 3 is deliberately not `Split internally`: broad exports and
size do not establish a boundary. Multiband remains the negative control: its
app-owned lint/format/lifecycle targets do not justify library extraction.

## Dependency-ordered planning packets

These packets are plans only. Every implementation needs a new exact-revision
plan, Fury review, and separate human authority; this report grants none.

### P0 — complete team-system attribution (recon prerequisite)

- Revision/scope: rerun against the then-current exact HEAD; read-only parser
  attribution for team-system imports, exports/consumers, test ownership, and
  fixture coupling only.
- Dependencies: none.
- Tests/evidence: closed row set, source digests, parser/version identity,
  unresolved dynamic imports, and reproducible totals.
- Rollback: discard ignored recon artifacts.
- Stops: ambiguous module resolution, generated-source contamination, or any
  required write.
- Authority gate: read-only recon authority only; no implementation authority.

### P1 — team-system lint target plan

- Revision/scope: exact post-P0 revision; one package-owned lint target and its
  declared Nx inputs/outputs only; no source cleanup or export changes.
- Dependencies: P0 evidence accepted; may run before P2 if independent.
- Tests: resolved target metadata; uncached run; second local-cache run; existing
  package build/test; affected graph for one representative package file.
- Rollback: revert only target/config additions and remove disposable caches.
- Stops: toolchain choice is ambiguous, baseline violations require broad code
  edits, target crosses package ownership, or environment blocks classification.
- Authority gate: separate exact P1 implementation authority after Fury review.

### P2 — team-system typecheck target plan

- Revision/scope: exact post-P0 revision; one typecheck target proving a
  contract distinct from build; no compiler-policy or export changes.
- Dependencies: P0; independent of P1 unless shared config is proposed.
- Tests: resolved metadata; command equivalence check against build; uncached
  and cached runs; package build/test; representative affected graph.
- Rollback/stops: revert only target/config additions; stop if it merely aliases
  build, expands compiler policy, or needs production edits.
- Authority gate: separate exact P2 implementation authority after Fury review.

### P3 — mission-preparation typecheck decision

- Revision/scope: exact revision after P1/P2 decisions; first compare build and
  proposed typecheck contracts, then either plan one target or record
  `Leave in place`.
- Dependencies: P1/P2 measurement conventions, not their implementation.
- Tests: command/diagnostic delta, resolved metadata, uncached/cached run if a
  distinct target is authorized, package build/test, representative affected
  graph.
- Rollback/stops: revert only target/config additions; stop on no distinct
  contract, cross-package config changes, or production edits.
- Authority gate: separate exact P3 implementation authority after Fury review.

P4, an internal split/extraction plan, does not exist. P0 must first produce
enough evidence to rescore candidate 3; `Insufficient evidence` cannot authorize
a child implementation.

## Before/after measurement schema

Each authorized child would emit paired `before` and `after` records at exact
commits using identical host category, Node/npm/Nx versions, environment
prerequisite classification, change selector, target set, cache directories,
and repetition count. Each record contains:

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

Fury's boundary challenge must independently test whether each proposed seam
has attributed consumers and ownership, whether a focused target is sufficient,
whether the negative control was respected, whether uncertainty changed the
disposition/order, and whether every packet remains planning-only. A Fury
technical verdict never supplies human authority.
