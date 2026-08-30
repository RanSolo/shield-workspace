# Mission Rail V1 — maintainability and boundary radar

This document is normative for Track-Layer construction. It keeps the clean
rail understandable to humans and fresh-context agents as it grows.

## Boundary rule

Create a library when a capability has its own vocabulary, lifecycle, public
contract, dependency direction, independent test cohort, or replacement pace.
Do not create a library only to reduce line count.

Create a module or component when behavior can be named, tested, and changed
independently inside one library. Extract a function when one transformation or
decision can be expressed without hidden ambient state.

## Boundary radar

Every feature answers these questions before implementation and again before
integration:

1. Did we introduce a new domain noun or state machine?
2. Does part of the change have a different side-effect boundary?
3. Can a coherent portion build and test without its current parent?
4. Does it need a different release, replacement, or compatibility policy?
5. Are two areas changing for unrelated reasons?
6. Is the same mechanical decision implemented more than once?
7. Would a fresh agent need to load unrelated code to understand this change?
8. Would an Nx project edge improve affected selection or cache reuse?

One “yes” prompts a module review. Multiple “yes” answers prompt a library
review. Fury decides the package boundary in the accepted plan; May may surface
new evidence but does not silently expand the graph.

## Seat responsibilities

- Daisy reports candidate seams, dependency direction, repeated logic, and
  independently testable cohorts during reconnaissance.
- Fury freezes package ownership, public interfaces, and allowed dependency
  edges in the plan.
- Hill ensures every issue names owned paths and an integration handoff.
- May keeps implementation inside the frozen boundary and reports emergent
  seams before creating cross-package coupling.
- Mack verifies the actual Nx graph, cycles, affected selection, cache behavior,
  lint, typecheck, tests, and SonarQube result.

## Size and complexity policy

These are executable defaults, not encouragement to split code mechanically:

- production source files: target at or below 300 lines; review required above
  400; 600 is a failing architectural smell unless generated or explicitly
  excepted;
- functions: target at or below 40 logical lines and cyclomatic complexity 10;
- parameters: target five or fewer; prefer one typed input for cohesive data;
- nesting: target four levels or fewer;
- public exports: expose domain operations and types, not internal helpers;
- one file should not own parsing, policy, I/O, projection, and execution.

An exception records why splitting would reduce clarity, its owner, and the
event that triggers reconsideration.

## Required project targets

Every new package starts with cache-enabled Nx targets for:

```text
build
test
typecheck
lint
```

Workspace validation additionally checks:

- dependency constraints and cycles;
- focused and affected selection from exact base/head revisions;
- warm-cache restoration;
- package exports and offline installation where publishable;
- deterministic output bytes where promised.

Direct `node --test` or compiler commands may diagnose a failure, but completion
evidence uses the Nx target.

## Static analysis and SonarQube

The Foundation milestone installs and configures the shared lint and static
analysis stack before feature code grows:

- TypeScript strict mode;
- ESLint with TypeScript, complexity, size, unsafe-code, and import rules;
- Nx dependency constraints using package tags;
- formatting and duplicate-code checks;
- unused file, export, and dependency checks;
- SonarQube analysis on every construction PR;
- a new-code quality gate that rejects blocker/critical findings, new cycles,
  unreviewed duplication, and uncovered changed behavior.

The exact SonarQube thresholds and exclusions live in checked-in configuration
and are reviewed with the Foundation issue. Baseline legacy debt is reported
separately; it cannot be disguised as a passing new-code result.

Static analysis is feedback first and a milestone gate second. During a feature,
warnings remain visible and actionable without repeatedly parking the worker.
Only configured correctness/security failures or the milestone quality gate
block integration.

The rail and replay kernels additionally use property-based tests for state
transitions, canonicalization, retry, and replay invariants. Mutation testing
runs at milestone boundaries only for these pure critical packages. Package
surface checks validate exports, declarations, and packed consumer behavior.
These targeted tools cover different failure classes; they do not duplicate
SonarQube or turn every edit into a full-repository gauntlet.

## Lightweight Guided Review

Human comprehension is part of correctness. The Foundation milestone includes
one small Guided Review contract with `plan`, `code`, and `qa` review kinds:

- divide the plan, exact diff, or QA scenarios into ordered
  acceptance-criterion-aligned sections;
- show plan scope and risks, code behavior and changed paths, or QA setup,
  action, expected result, observed result, and evidence;
- allow `accept`, `question`, or `revise`; QA additionally records `pass`,
  `fail`, or `blocked`, all with concise comments and evidence references;
- bind decisions to the exact subject digest and repository revision;
- return revisions or failures to the accountable seat without discarding the
  human's reasoning;
- derive the final implementation approval from the completed canonical review,
  while keeping the cryptographic authorization a separate human effect;
- provide both terminal-readable and static HTML projections over one JSON
  contract.
- require QA to execute the exact candidate in a disposable proving environment
  and retain visible outcome evidence; a checklist or test report alone cannot
  produce `passed`.

Plan/code aggregation is `revise` before `question/missing` before unanimous
acceptance. QA keeps scenario acceptance separate from execution and aggregates
mandatory outcomes in the order `failed`, `blocked`, `incomplete`, `passed`.
Optional scenarios remain visible but do not override mandatory outcomes.

The first version is not a broad Mission Control application. It is the
smallest review surface that lets the accountable human keep pace with the
agents and prevents a fast team from turning plan, code, or QA acceptance into
blind trust.

The V1 proving flight must use the engine to review its own plan, inspect its
own exact code revision, and execute its own operator-facing QA scenarios.
Contract tests, static analysis, and Mack validation are necessary but cannot
substitute for this human-visible proving loop.

## Demonstration quality

The clean rail is a reference implementation, not disposable scaffolding. A
technical reviewer must be able to:

- understand the package graph and dependency rationale from one page;
- open any production module without loading unrelated subsystems;
- find the public contract and focused tests beside the behavior;
- run one package's Nx targets and observe cache reuse;
- inspect SonarQube new-code status and declared exceptions;
- follow a mission from event log to projection to host effect;
- distinguish new kernel code from explicit legacy adapters.

Unexplained TODOs, disabled rules, broad coverage exclusions, compatibility
fields inside the kernel, and passing tests that contradict recorded evidence
are release blockers for V1.

## Package and function design

- Prefer pure domain functions receiving explicit typed inputs.
- Keep I/O behind narrow ports implemented in `mission-host`.
- Represent outcomes with closed discriminated unions.
- Put human prose in projections, not domain decisions.
- Keep canonical identifiers and digests in `canonical-contract`.
- Keep compatibility translation at repository edges.
- Avoid boolean parameter bundles, ambient environment reads, and generic
  “utils” modules.
- Co-locate focused tests with the package behavior they prove.

## Mission Control connection

`mission-projection` is the canonical Mission Control and CLI read model. It
consumes validated mission/store/lane facts plus Guided Review aggregate facts
and emits stable JSON for:

- mission and issue identity;
- current phase and exact revision;
- Alpha/Bravo/Charlie state;
- active seat, host, model, and run;
- blocker or human-gate classification;
- validation/review/publication status;
- one recommended next action.

Mission Control and CLI render this projection. Guided Review renders its own
closed review contract and sends typed decisions through `mission-host`; it
does not depend on `mission-projection`. User actions become typed commands
submitted to `mission-host`, which observes the environment and offers facts
to `mission-rail`. The UI never appends events, signs authority,
or infers state.

## Review checklist

A feature cannot enter its milestone unless:

- owned paths match the machine manifest;
- no undeclared dependency edge or cycle exists;
- size/complexity exceptions are recorded;
- focused Nx targets pass with cache enabled;
- SonarQube new-code status is recorded honestly;
- changed public contracts have examples and compatibility disposition;
- Mission Control projection effects are identified;
- the integration handoff names an exact commit/tree.
