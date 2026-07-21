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

This section is intentionally unscored and empty at initial publication. After
the initial brief, benchmark manifest, and evidence-log schema are committed
and the draft PR receipt is verified, May owns the complete blueprint added
here. Hill must not author or repair that content.
