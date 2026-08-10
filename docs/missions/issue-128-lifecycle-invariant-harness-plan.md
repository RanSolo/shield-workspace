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

1. explicit valid chains containing three, four, and five supersession transitions;
2. a compact matrix that demonstrates reproducible short sequences and later
   stale-identity reuse;
3. exactly-one-current-revision assertions after every valid replay prefix,
   zero-current-Fury routing, and fail-closed branching/duplicate-review attempts;
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

Use fixed A/B/C/D/E/F revision identities and deterministic timestamps derived
from the entry sequence. Include valid sequences with three, four, and five
supersession transitions and reuse vectors for both the initial and a later stale
identity. Each failure message must include the vector name and complete ordered
revision sequence so a failure is reproducible without a seed.

Replay derives revision lifecycle atomically; no public input surface accepts an
already-projected lifecycle flag. Therefore the experiment does not claim to inject
a valid projection containing zero or multiple lifecycle-current revisions. It
proves the invariant by asserting exactly one current revision after every valid
prefix, and by proving all reachable branching/reuse attempts fail before a
multiple-current projection can exist. If direct projection injection is required,
the experiment must stop and select **Revise** or **No change** rather than edit
production code.

## Acceptance matrix

| ID | Sequence/case | Required observation |
| --- | --- | --- |
| L128-01 | A→B→C→D (3 transitions) | After every prefix, revision IDs are unique and exactly the terminal revision is lifecycle-current |
| L128-02 | A→B→C→D→E and →F (4/5 transitions) | Every superseded revision remains stale; earlier Fury/human evidence never satisfies the terminal revision |
| L128-03 | A→B→A and A→B→C→B | Constructor and equivalent raw replay reject initial/later stale reuse with `invalid/revision_mismatch` |
| L128-04a | preserved A history after B/C | Pre-supersession A evidence remains attributable history with lifecycle `stale` |
| L128-04b | late A review after B/C | Constructor and raw replay reject it with `invalid/revision_mismatch`; Fitz never becomes ready |
| L128-05a | duplicate Fury review ID | Constructor/replay rejects the duplicate with `invalid/duplicate_evidence` |
| L128-05b | different Fury decision on reviewed revision | Constructor/replay rejects it with `invalid/decision_mismatch` |
| L128-06 | zero current Fury reviews | Valid revision projection has exactly one current revision while routing remains `waiting/current_head_fury_review_required` |
| L128-07 | second child of stale A | Constructor/raw replay rejects wrong predecessor with `invalid/revision_mismatch`; no multiple-current projection is emitted |
| L128-08a | malformed identity/noncanonical raw requirements | Replay rejects with `invalid/malformed` |
| L128-08b | constructor cannot derive one predecessor requirement | Constructor rejects with `invalid/missing_requirement` |

Tests must assert both constructor behavior and replay behavior where those surfaces
have distinct responsibilities. Existing tests remain intact unless a tiny local
helper extraction removes literal duplication without changing assertions.

## Experiment measurement and disposition

Use commit `9fadc851f31555d871e9771ad328e892809a6bba` as the
pre-test-change runtime baseline (the test file is unchanged there) and the
eventual implementation commit as the post-change revision. Record Node and npm
versions, dependency-lock digest, CPU architecture, command, test count, and exact
revision. Run the focused command uncached five times at each revision in the same
worktree/environment and compare median wall time. Record changed lines, helper
count, vector count, altered existing assertions, added dependencies, and added
fixture files.

The implementation handoff must identify its exact SHA and contain exactly one
`Disposition: Adopt|Revise|No change` label:

- **Adopt** — every reachable acceptance row passes; the focused median increases
  by no more than 25% and 500 ms absolute; the delta uses at most two local helpers
  and twelve vectors, changes at most 250 lines, alters no existing assertion, and
  adds no dependency or fixture file. Open separate rollout issues rather than
  generalizing production code here.
- **Revise** — the experiment is useful but at least one required invariant needs a
  second bounded test design or clearer failure evidence.
- **No change** — the matrix duplicates mission-specific tests, obscures semantics,
  is unstable, or cannot test required behavior without production/schema changes.

## Validation

Run at the exact implementation HEAD:

1. `git rev-parse HEAD`
2. `git status --porcelain` (must be empty)
3. `node --test packages/shield-team-system/tests/revision-lifecycle-v7.test.mjs`
4. `npx nx test @shield/team-system --skip-nx-cache`
5. `git diff --check 27d3fe7ab3051fd9b8a33032912dae65c389f4f2..HEAD -- . ':(exclude)docs/missions/issue-128-lifecycle-invariant-harness-plan.md'`
6. `git diff --name-only 27d3fe7ab3051fd9b8a33032912dae65c389f4f2..HEAD -- . ':(exclude)docs/missions/issue-128-lifecycle-invariant-harness-plan.md'`
   (exactly the authorized test file; the only excluded path is the exact
   content-addressed plan reviewed by Fury)
7. `git diff --check 27d3fe7ab3051fd9b8a33032912dae65c389f4f2..HEAD`
8. `git diff --name-only 27d3fe7ab3051fd9b8a33032912dae65c389f4f2..HEAD`
   (exactly the plan document and authorized test file)

Mack independently reruns the focused and affected validation, verifies both exact
diff ranges, checks that vector failure output includes the complete reproducible
sequence, validates the measurements at their recorded revisions, and confirms the
single disposition follows the numeric criteria. Fury then reviews exact-revision
conformance.

## Authorized implementation paths

- `packages/shield-team-system/tests/revision-lifecycle-v7.test.mjs`

The planning document itself may be committed before implementation authority.
Implementation stops on any source/schema/public-surface requirement, nondeterminism,
unbounded sequence generation, path expansion, or inability to prove an acceptance
row through the existing public test imports.
