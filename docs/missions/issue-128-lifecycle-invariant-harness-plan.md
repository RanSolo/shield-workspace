# Issue #128 — lifecycle-invariant harness experiment

## Frozen identity and boundary

- Repository: `RanSolo/shield-workspace`
- Exact planning base: `27d3fe7ab3051fd9b8a33032912dae65c389f4f2`
- Subject: supervised journal v7 review-revision lifecycle behavior
- Authority: planning/reconnaissance only until this exact plan passes Fury and
  receives fresh Coulson Wheels Up authority
- Product behavior, journal schema, runtime code, public API, and unrelated tests
  are excluded.

## Hypothesis

A small deterministic matrix layered onto the existing readable lifecycle tests
can expose revision reuse, stale-authority reactivation, ambiguous current-state
projection, and broken supersession chains without hiding journal semantics behind
an opaque generated-state framework.

## Repository findings

The existing `revision-lifecycle-v7.test.mjs` already proves A→B, stale A after B,
A→B→A constructor and replay rejection, fabricated/replayed human-evidence
rejection, and several conflicting lifecycle cases. Missing or incomplete direct
coverage is limited to:

1. an explicit valid A→B→C chain;
2. a compact matrix that demonstrates reproducible short sequences;
3. dedicated zero-current and fail-closed multiple-current assertions;
4. a consolidated malformed-supersession matrix; and
5. measured focused runtime and an explicit Adopt/Revise/No change disposition.

No observed gap requires editing `mission-v2.mts`. Any discovered need for a
runtime correction stops this experiment and requires a separately reviewed plan.

## Exact implementation

Modify only
`packages/shield-team-system/tests/revision-lifecycle-v7.test.mjs`.

Keep helpers local to that file. Add one small deterministic sequence helper that
uses existing constructors for valid transitions and supports explicitly marked
raw-entry injection only for replay-adversarial vectors that constructors correctly
refuse to create. Do not add dependencies, randomness, property-testing libraries,
new fixture files, or shared production/test abstractions.

Use fixed A/B/C revision identities and deterministic timestamps derived from the
entry sequence. Each failure message must include the vector name and the complete
ordered revision sequence so a failure is reproducible without a seed.

## Acceptance matrix

| ID | Sequence/case | Required observation |
| --- | --- | --- |
| L128-01 | A→B | A remains historical/stale, B is current, and fresh B Fury evidence is required |
| L128-02 | A→B→C | A and B remain stale, exactly C is current, and no A/B evidence satisfies C |
| L128-03 | A→B→A | Constructor rejects reuse with `revision_mismatch`; equivalent raw replay is invalid |
| L128-04 | stale A review after B/C | Stale evidence remains attributable history but cannot make Fitz routing ready |
| L128-05 | duplicate/conflicting current Fury | Constructor or replay fails closed with the existing deterministic error class |
| L128-06 | zero current Fury | Valid projection remains `waiting/current_head_fury_review_required` |
| L128-07 | multiple-current attempt | Supported constructors cannot emit it; adversarial replay is invalid and never projects ready |
| L128-08 | malformed/broken supersession | Wrong predecessor, malformed identity, missing requirement, and broken lineage each fail closed |

Tests must assert both constructor behavior and replay behavior where those surfaces
have distinct responsibilities. Existing tests remain intact unless a tiny local
helper extraction removes literal duplication without changing assertions.

## Experiment measurement and disposition

Capture the targeted command's wall-clock duration and test count before and after
the matrix using the same exact HEAD/environment. Record no benchmark claim from a
cached or different-revision run. The implementation handoff must select exactly
one disposition:

- **Adopt** — the local matrix catches all required cases, remains readable, adds
  negligible focused runtime, and provides a clear reusable pattern; open separate
  rollout issues rather than generalizing production code here.
- **Revise** — the experiment is useful but at least one required invariant needs a
  second bounded test design or clearer failure evidence.
- **No change** — the matrix duplicates mission-specific tests, obscures semantics,
  is unstable, or cannot test required behavior without production/schema changes.

## Validation

Run at the exact implementation HEAD:

1. `node --test packages/shield-team-system/tests/revision-lifecycle-v7.test.mjs`
2. `npx nx test @shield/team-system --skip-nx-cache`
3. `git diff --check`

Mack independently reruns the focused and affected validation, verifies no changed
path outside the allowlist, checks reproducibility of a deliberately failing local
copy without committing it, and confirms the selected disposition follows the
criteria. Fury then reviews exact-revision conformance.

## Authorized implementation paths

- `packages/shield-team-system/tests/revision-lifecycle-v7.test.mjs`

The planning document itself may be committed before implementation authority.
Implementation stops on any source/schema/public-surface requirement, nondeterminism,
unbounded sequence generation, path expansion, or inability to prove an acceptance
row through the existing public test imports.

