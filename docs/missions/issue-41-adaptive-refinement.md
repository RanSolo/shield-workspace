# Mission Brief: Issue #41 Adaptive Refinement Experiment

- **Canonical experiment:** `RanSolo/shield-workspace#41`
- **Implementation fixture:** `RanSolo/shield-workspace#59`
- **Mission state:** Wheels Up authorized by Phil Coulson
- **Base revision:** `4a3c3380c8daa5fc86d6b24960fc2245acec8d27`
- **Delivery strategy:** standard sequential S.H.I.E.L.D.
- **Implementation owner:** Melinda May
- **Readiness assessor:** Maria Hill
- **Threat and conformance reviewer:** Nick Fury
- **Independent post-seal grader:** Leo Fitz (human)
- **Human authority:** Phil Coulson

## Objective

Prospectively determine whether Maria Hill can use `hill.readiness.v1` to
return one operationally incomplete implementation blueprint to its owning
seat for one bounded refinement before Fury review. The experiment must improve
readiness, preserve May's ownership, and leave Fury's adversarial architecture
authority intact.

Issue #59 supplies the smallest live implementation fixture: establish one
canonical sensitive-repository-path policy or generated fixture and prove
equivalent enforcement by `readFile`, `listFiles`, and `searchRepo` without
changing the accepted Issue #34 authority or runtime boundaries.

One run produces evidence and counts, not a statistically meaningful accuracy
claim or a universal orchestration recommendation.

## Dependencies and experimental isolation

- #58 and PR #62 supply the merged `hill.readiness.v1` rubric.
- #54 and PR #63 supply the merged early Fury plan gate.
- #12 supplies the benchmark measurement language and common clocks.
- #34 and PR #57 are disclosed observational evidence, not a blind baseline.
- #61 remains downstream and is not combined with this experiment.

The dependency order remains:

```text
#58 -> #54 -> #41/#59 live experiment -> #61 -> Runtime Contracts v1 freeze
```

Combining #41 with #61 would change refinement policy and runtime capability at
the same time. This run therefore preserves standard sequential orchestration
and records actual runtime assignments without treating provider identity as
the experimental variable.

## Frozen workflow

Only the pre-Fury May-artifact profile is under test:

```text
Daisy reconnaissance
-> Hill freezes external fixture and grading rules
-> May commits the scored Mission Brief implementation blueprint
-> Hill evaluates the exact revision with hill.readiness.v1
   -> GOOD_ENOUGH: proceed to Fury
   -> NEEDS_REFINEMENT: return once to May, then reevaluate exact corrected revision
   -> BLOCKED_ESCALATE: stop for Coulson
-> Fury Threat Review through fury.plan-gate.v1
-> May implements the approved #59 slice
-> Hill integration validation
-> Fury Conformance Review
-> human Fitz technical review and independent benchmark grading
-> Coulson retains merge authority
```

Daisy-artifact refinement is documented by #41 but not activated in this run.
Post-Fury repair is recorded separately if triggered and is never counted as
the pre-Fury Hill intervention.

## Ownership and authority

- May alone authors and refines the implementation blueprint and source change.
- Hill selects a closed readiness outcome and bounded reason codes; Hill never
  edits May's blueprint or implementation.
- A Hill result is advisory workflow evidence. It grants no authority, changes
  no mission state, and cannot replace Fury or Coulson.
- Fury owns threat and conformance findings. Hill cannot reinterpret, waive, or
  overrule them.
- Fitz is a human seat. No model, persona prompt, or runtime may occupy Fitz.
- Coulson is the sole merge authority.
- Seat, reasoning runtime, and actual tool executor are recorded separately.

## Scored artifact and freshness

May's scored artifact is an `implementation_blueprint` appended to this Mission
Brief after the initial brief, external grading manifest, and evidence-log
schema are committed and the draft Mission Workspace is verified.

The original and any corrected blueprint revisions remain in Git history. Each
Hill decision binds to the exact repository head containing the blueprint. Any
subsequent commit makes the prior observation stale and requires a new exact
observation.

The trusted orchestrating host supplies `hill.readiness.v1` with a truthful
`host_asserted_non_authoritative` observation derived from:

- the verified draft-PR receipt and exact current Git head;
- the append-only experiment evidence log in
  `docs/validation/issue-41-evidence-v1.jsonl`;
- the log's last sequence and entry ID;
- the number of completed pre-Fury Hill refinements in that log; and
- asserted reasoning-runtime and tool-executor identities.

The pure evaluator does not authenticate those claims. The log is benchmark
evidence only and never modifies or supersedes authoritative Mission Journal,
Kernel, permission, or mission state.

## Separate bounded correction limits

1. **Pre-Fury Hill refinement:** zero or one May-owned blueprint refinement.
2. **Fury plan reconciliation:** one May-owned reconciliation of an exact
   `PASS_WITH_REQUIRED_CHANGES` finding set under #54.
3. **Post-implementation repair:** governed separately by the mission repair
   policy and Coulson authorization; it is not silently borrowed from either
   earlier limit.

A second requested Hill refinement, unprescribed architecture change, repeated
Fury failure, or scope expansion stops the mission for Coulson.

## Issue #59 implementation boundary

The smallest permitted slice:

- define one reviewable canonical denied-path case source;
- derive or validate direct-path matching and ripgrep exclusions from it;
- prove equivalent behavior across `readFile`, `listFiles`, and `searchRepo`;
- include case variants, nested sensitive directories, environment files,
  credential/token/authentication names, private-key basenames, and key/archive
  extensions;
- make the frozen mutation case fail if any one tool misses a denied path;
- preserve no-shell execution, trusted ripgrep identity, repository-root
  confinement, bounds, deadlines, symlink denial, and current public behavior.

No routing, authority, Kernel, Journal, permission, LM Studio, broker protocol,
runtime-profile, Mission Control, deployment, or release work is in scope.

## Validation obligations

- frozen external cases and mutation rule pass;
- all three repository tools enforce equivalent denied-path behavior;
- existing repository-tools and Issue #34 adversarial tests pass;
- package and workspace tests pass;
- packed strict-consumer and package dry-run paths remain valid when affected;
- `git diff --check` passes;
- no public surface is added unless the blueprint proves it is necessary and
  Fury approves it before implementation.

## Benchmark evidence

Use `docs/validation/issue-41-benchmark-manifest-v1.md` as the external grading
contract. Record common timestamps, per-seat runtime/executor attribution,
invocations, tokens, context, observable cost, correction cycles, exact heads,
Fury findings by class, human interventions, diff size, tests, and discarded or
failed work. Every value is `Measured`, `Derived`, `Estimated`, or
`Not observable`.

Prediction classification is frozen as:

- `GOOD_ENOUGH` plus Fury PASS or Fury-only findings: correct escalation;
- `GOOD_ENOUGH` plus a predictable operational omission: Hill miss;
- `NEEDS_REFINEMENT` plus externally material improvement: useful refinement;
- `NEEDS_REFINEMENT` plus immaterial change or unchanged later result:
  unnecessary refinement.

Human Fitz grades only after the Hill decision and Fury findings are sealed.
The grader may not rewrite the original Hill result.

## Stop conditions

Stop immediately for missing or ambiguous observation provenance; Hill editing
May's artifact; ownership transfer; a second Hill refinement; ambiguous or
changed external grading; scope expansion; runtime substitution without
Coulson; architectural redesign; fabricated analytics; or any need to change
Kernel, authoritative journal, permission, production routing, deployment, or
release semantics.

## Acceptance criteria

- [ ] The fixture and external grading contract are frozen before May's scored
      blueprint.
- [ ] The draft Mission Workspace is verified before May is dispatched.
- [ ] May alone owns the blueprint, any refinement, and implementation.
- [ ] Hill emits one exact-revision `hill.readiness.v1` result before Fury.
- [ ] `NEEDS_REFINEMENT` returns exactly once to May; other outcomes follow the
      closed gate.
- [ ] A corrected artifact receives a fresh exact-revision Hill evaluation.
- [ ] Fury performs threat review only after Hill's final readiness decision.
- [ ] Operational omissions and Fury-only findings remain distinct.
- [ ] The #59 mutation rule and three-tool parity checks pass.
- [ ] Seat, runtime, executor, time, usage, context, cost, and interventions are
      reported truthfully with observability labels.
- [ ] Human Fitz grades the sealed evidence and performs technical review.
- [ ] The report recommends adoption, revision, or rejection without claiming
      statistical significance.

## Authorization

Phil Coulson authorized the combined #41 experiment and bounded #59
implementation, Mission Brief commit, verified draft Mission Workspace,
standard sequential workflow, one pre-Fury May refinement, #54 Fury plan
reconciliation, implementation, validation, Fury conformance, and return to
human Fitz. Merge, deployment, release, production effects, runtime
substitution, and expanded correction cycles remain unauthorized.

## May implementation blueprint

### Implementation slice

Replace the two independently maintained sensitive-path implementations in
`repository-tools.mjs` with one internal, declarative policy compiled into both
forms required by the existing tools. The change remains inside the Issue #34
repository-tool implementation and its focused tests. It does not add a
package subpath, public broker capability, runtime option, caller-selectable
policy, or new authority source.

### Canonical representation and compilation

Add `scripts/model/repository-sensitive-policy.mjs` as the single production
policy source. Its closed, frozen representation contains three unique,
lowercase ASCII literal sets:

- exact denied path segments: `.git`, `.ssh`, `.aws`, `.gnupg`, and
  `credentials`;
- basenames denied either exactly or with a dot suffix: `.env`,
  `credentials`, `token`, `tokens`, `auth`, `authentication`, `id_rsa`,
  `id_dsa`, `id_ecdsa`, and `id_ed25519`;
- denied final extensions: `pem`, `key`, `p12`, and `pfx`.

The overlap for `credentials` is intentional: the segment rule denies a
directory and all descendants, while the basename rule also denies names such
as `credentials.json`. The policy does not use unanchored substring matching;
`authors.md`, `tokenization.md`, and `keys/public.txt` therefore remain safe.

At module initialization, a private compiler validates that the policy has the
exact closed fields, dense arrays, and unique literals. Segment and basename
literals must match the allowlist grammar
`^(?:\.)?[a-z0-9][a-z0-9_-]{0,63}$`; extension literals must match the narrower
grammar `^[a-z0-9]{1,8}$`. These grammars reject path separators, controls,
whitespace, a leading `!`, extra dots, and every glob operator including `*`,
`?`, `[`, `]`, `{`, and `}` before any immutable direct matcher or exclusion
glob is generated. A violated developer invariant throws before tools can be
created. Callers cannot supply or mutate the policy.

The compiler produces two immutable artifacts from that one representation:

1. A direct-path predicate. It splits the repository-relative path into
   segments, applies ASCII case folding, and denies any exact sensitive
   segment, any exact/dot-suffixed sensitive basename, or any denied final
   extension. `repository-tools.mjs` continues to export
   `isSensitiveRepositoryPath` as a compatibility-preserving re-export.
2. A deterministic array of ripgrep exclusion globs. Literal letters are
   expanded into explicit case pairs, literal dots are escaped as glob
   literals, segment rules become exclusions for descendants, basename rules
   become exact and `.<suffix>` exclusions, and extension rules become final
   extension exclusions. `searchRepo` inserts those generated values only as
   repeated `--glob`, value pairs in its existing closed argument vector.

`repository-tools.mjs` binds those compiled artifacts into one private frozen
tool-enforcement record with three explicit entries: the predicate used by
`readFile`, the same predicate used by both the requested-directory and
recursive-child checks in `listFiles`, and the generated exclusion arguments
used by `searchRepo`. The entries are not exported, configurable, replaceable,
or derived from options. They make each real enforcement path independently
identifiable for the mutation test without duplicating the policy.

`readFile` and `listFiles` apply their named private binding after relative-path
syntax validation and before filesystem resolution or traversal.
`resolveConfined` retains root identity, lstat, symlink, type, and escape
enforcement but no longer owns a shared sensitive-policy decision that would
make a one-tool mutation ambiguous. This is an internal separation of existing
checks, not a change to denial order or results.

No regex or glob is constructed from repository paths, search patterns, model
output, environment values, or other caller-controlled data. Existing
relative-path validation runs before the direct predicate. The trusted `rg`
identity probe, `--no-config`, `--hidden`, `--`, no-shell spawn, controlled
environment, root verification, timeouts, and output bounds remain unchanged.

### Exact file surface

- Add
  `packages/shield-team-system/scripts/model/repository-sensitive-policy.mjs`.
- Modify
  `packages/shield-team-system/scripts/model/repository-tools.mjs` only to
  import/re-export the direct predicate, consume the generated exclusion
  globs through the private frozen per-tool enforcement bindings, and remove
  the duplicated constants and hard-coded exclusion block.
- Modify
  `packages/shield-team-system/tests/repository-tools.test.mjs` to add the
  frozen three-tool parity harness, safe controls, and mutation-sensitivity
  checks while preserving all existing Issue #34 adversarial tests.

No declaration, package export, broker, runner, LM Studio, authority, Journal,
Kernel, documentation outside this Mission Brief, generated `dist`, or
workspace application file is expected to change.

### Externally graded parity tests

The focused test owns one black-box fixture table copied from the already
frozen benchmark manifest, not generated from the production policy. A single
temporary repository contains every denied case and the four safe controls;
each file contains a unique bounded search marker. One shared assertion checks
each denied path across all three real tool observations:

- `readFile` returns `path_denied`;
- recursive `listFiles({ directory: "." })` omits the path;
- `searchRepo` output omits the path and its marker.

The same assertion requires successful reads and listing/search visibility for
`src/visible.txt`, `docs/authors.md`, `docs/tokenization.md`, and
`keys/public.txt`. This independently detects both false negatives and the
current search-only substring false positives.

The frozen `nested/.AWS/credentials.backup` mutation is appended once to that
shared denied table. After the complete unmodified fixture passes, mutation
sensitivity uses a fresh minimal fixture containing that one frozen denied
path and the unchanged safe controls. The test creates three isolated
temporary ESM copies of `repository-tools.mjs` and its policy module. For each
copy it performs one exact, count-checked source mutation to the private
enforcement record: replace only the `readFile` predicate with an always-allow
predicate, replace only the `listFiles` predicate with an always-allow
predicate, or replace only the `searchRepo` exclusion arguments with an empty
frozen array. Failure to find exactly one expected mutation site fails the
test.

Each mutated module must import successfully and construct the real repository
tools with the trusted, identity-probed `rg` before it is scored. The harness
first records successful unmodified observations for the same minimal fixture.
For a mutant, every safe-control observation and both unaffected tool
observations must equal that baseline. The remaining difference must be
exactly one structured mismatch naming the expected tool,
`nested/.AWS/credentials.backup`, and its unique marker: readable content for
the read mutant, one emitted list path for the list mutant, or one returned
search marker for the search mutant. The test must compare this exact mismatch
record; it must not use a broad rejection assertion that could pass because of
an import, construction, filesystem, timeout, or assertion error.

Unavailable `rg`, failed identity probing, a non-completed baseline search,
mutant import or construction failure, an unrelated mismatch, a changed safe
control, or any second mismatch fails the mutation test. These are mutations
of the actual tool enforcement paths before execution, not altered
post-execution observations or three copied expectation lists. Mutant source
exists only under the test temporary directory and is removed by test cleanup;
the production module exposes no mutation switch, policy injection option, or
test-only export.

The parity integration test uses the same trusted, identity-probed `rg` path as
the existing search test. The acceptance run must execute it on a host with
trusted `rg`; a skipped search parity test is not a passing acceptance result.
Existing confinement, symlink, root-replacement, executable-identity, timeout,
bounds, UTF-8, and closed-argument tests remain in place.

### Compatibility and failure behavior

The three tool names, inputs, result unions, denial codes, bounds, ordering,
and public package surface remain unchanged. Direct reads and listings retain
their current deny-before-effect behavior. Search remains fail closed when
`rg` is absent, replaced, invalid, or times out. The only intended observable
expansion is that safe basenames previously over-excluded by broad search
globs, including `authors.md` and `tokenization.md`, become searchable; no
frozen sensitive case becomes visible.

An invalid built-in policy is a developer/build defect and prevents module
initialization rather than silently compiling a partial policy. Runtime path,
filesystem, root, and executable failures continue to return the existing
bounded non-echoing tool results. No denied path contents are logged or added
to assertions.

### Post-reconciliation gate order

After this final corrected blueprint is committed, the trusted orchestrating
host obtains the exact new repository head and Hill reevaluates that head with
`hill.readiness.v1`, `refinementPassesCompleted: 1`, and the current truthful
observation binding. Hill publishes the resulting exact-revision readiness
evidence to the Mission Workspace without creating another repository commit.
The host then verifies that the repository head is unchanged before Fury
verifies the corrected plan and its complete finding reconciliation. Any
stale head, second requested Hill refinement, publication commit, or ambiguous
observation stops under the frozen mission rules.

### Validation sequence

1. Run the focused repository-tool suite and confirm every external case, safe
   control, and all three one-tool mutants behave as specified.
2. Re-run the existing Issue #34 broker and repository-tool adversarial tests.
3. Run the complete `@shield/team-system` package tests and workspace tests.
4. Run the packed strict-consumer validation and package dry run only if the
   package surface or packing result is affected; otherwise record them as
   unchanged/not applicable rather than fabricating execution.
5. Run `git diff --check` and report exact tests, skips, files, diff size,
   revision, runtime, executor, time, and observable usage under the frozen
   benchmark labels.

### Stop conditions

Stop and return to Coulson if exact direct-path semantics cannot be represented
by closed ripgrep globs without a false positive or negative; trusted `rg` is
unavailable for the acceptance parity run; a public API or caller-selectable
policy becomes necessary; preserving parity requires changing root,
symlink/race, executable-identity, bounds, deadlines, broker, permission,
authority, Journal, Kernel, or runtime semantics; the external fixture or
grading rules must change; implementation ownership moves from May; or the
slice requires architecture beyond a Fury-reviewed blueprint reconciliation.
