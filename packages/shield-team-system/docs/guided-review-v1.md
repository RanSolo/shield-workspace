# Guided Review v1

Guided Review is SHIELD's human-facing review engine. It turns a candidate into
a visible route of small decisions that persist to the final gate. It is not a
second automated QA system: `qa.mode.v0` and Mack validation retain machine
evidence, while Guided Review records what a named human actually inspected,
understood, observed, or could not verify.

## Interaction model

The hierarchy is deliberate:

```text
playbook
  → stage (one durable checkpoint)
    → question
    → question
    → question
```

Each screen asks one question. Several ordered questions make up a stage. A
stage passes only after every question has a `pass` or `conditional_pass`
decision. `fail` and `not_observed` block the stage and preserve a finding.
`conditional_pass` preserves a named condition in the final journey recap.

The reviewer can always inspect the current stage, next question, completed
stages and questions, findings, carried conditions, correction count, and exact
candidate revision.

## Built-in playbooks

### Backend

The Backend playbook guides representative API, CLI, job, event, database, or
library inputs through outputs and failure behavior. It reveals responsible
handlers, queries, schemas, contracts, effects, and exact automated evidence.

### Frontend

The Frontend playbook teaches intent, then walks representative success,
failure, and recovery behavior. A reviewed Cypress flow may prepare and
navigate application state, but Cypress GREEN remains technical evidence and
never fabricates the participant's visual or usability observation.

### Spike

Spike review walks through placement and purpose, summary, acceptance
mapping, linked example folders/files, comparison quality, recommendation
conditions, accumulated corrections, and the exact document candidate. This is
the playbook for discovery records, ADRs, scorecards, and Confluence drafts.

Guided Code Review is cross-cutting rather than a fourth peer playbook. Every
journey includes a focused responsible-code step that connects an acceptance
criterion and observed behavior or claim to the relevant symbol, diff, POC, and
automated evidence.

## Profiles

- `exploration` permits an incomplete or blocked runtime handoff and produces
  non-authoritative learning evidence.
- `acceptance` requires a builder-produced `ready` runtime receipt bound to the
  candidate revision.
- `publication` has the same runtime requirement and can become eligible for
  the publication fork only after every stage passes.

Routine dependency, environment, fixture, binding, port, health, external-
effect policy, teardown, and recovery work belongs in the builder runtime
handoff. It embeds a content-addressed `guided.review.driver.v1` receipt naming
the driver/version, actual executor, exact revision and environment,
capabilities, scenarios, evidence, and effect class. Driver output remains
distinct from participant observation and authority. The first human
checkpoint begins after both receipts say ready.

The session also freezes the named participant, their relationship to the
candidate, optional SHIELD seat, and binding reference. Every step decision is
therefore attributable through the content-addressed session. The later
publication key turn binds that session; the runner itself never signs or
claims a human result.

## Plan selection

Before a playbook or omission route exists, the plan records `required`, a
reviewable rationale, method, selected participant relationship, covered
acceptance-criterion references, evidence requirements, exact revision,
playbook kind, and `gateOwnerSeatId: coulson`.
A required plan must name at least one criterion and evidence requirement. A
playbook can only be built from a required plan with the same mission, subject,
kind, participant relationship, and revision. This permits builder-led review
when the plan explicitly selects it while preserving an independent or Product
relationship when policy requires one. A safely omitted plan remains inspectable and is the only
plan for which the `no` publication route is PIN-eligible.

## Corrections and revision changes

A same-scope correction creates a new exact revision and supplies a fresh
builder runtime handoff bound to that revision. The caller names the
questions whose evidence changed; the engine also marks their downstream
dependencies stale. Unaffected decisions remain intact. The session resumes at
the first stale question instead of replaying the full journey.

This contract records correction and replay eligibility. It does not itself
grant file-write, command, journal, or implementation authority. The host must
bind any actual correction effect to the active mission and authority envelope.

## Publication fork

The gate offers `yes`, `no`, and `cancel`:

- `yes` requires a completed publication-profile session for the exact
  candidate and yields `pinPurpose: guided_review_and_publication`;
- `no` records `skipped_by_operator` and yields `pinPurpose: publication` only
  when the exact-candidate plan explicitly permits omission;
- `cancel` yields no PIN and no publication intent.

Both successful routes specify exactly one remaining PIN. The public fork
contract is intentionally `authority: none`: it does not read a passcode, sign,
append a journal entry, push, publish, merge, deploy, or release. The
profile-aware `mission prepare-next` host consumes a PIN-eligible fork, shows
its plan/session/fork identities in the publication decision, and embeds the
fork digest in the signed publication authorization `sourceRef`. That is one
key turn: the same PIN binds the selected Guided Review route and exact review-
candidate publication. Missing, cancelled, blocked, malformed, or stale fork
evidence stops before decision rendering or passcode access.

## Durable CLI

Freeze the required-or-omitted plan first:

```bash
shield guided-review plan create \
  --input .shield/tmp/guided-review/plan-input.json \
  --output .shield/tmp/guided-review/plan.json
```

Create a standard playbook from a closed context containing that required
plan:

```bash
shield guided-review playbook create \
  --kind frontend \
  --input .shield/tmp/guided-review/context.json \
  --output .shield/tmp/guided-review/playbook.json
```

Start and display the first question:

```bash
shield guided-review start \
  --playbook .shield/tmp/guided-review/playbook.json \
  --profile publication \
  --session-id session:example \
  --participant .shield/tmp/guided-review/participant.json \
  --output .shield/tmp/guided-review/session.json
```

Record one answer and show the next question:

```bash
shield guided-review decide \
  --playbook .shield/tmp/guided-review/playbook.json \
  --session .shield/tmp/guided-review/session.json \
  --decision-id decision:example:1 \
  --disposition pass \
  --observation "Observed the expected behavior at 100%."
```

`status` reopens the current question. `revise` binds a new revision and stale
question list. `checklist` emits the reusable publication/QA checklist.
`publication-choice` freezes the non-authoritative Yes/No/Cancel fork artifact.
Give the PIN-eligible result to the existing prepared publication key turn:

```bash
shield mission prepare-next \
  --mission-id mission:example \
  --guided-review-fork .shield/tmp/guided-review/fork.json
```

Playbooks, sessions, and fork artifacts are content-addressed. Session updates
use an exclusive lock, exact-byte compare, file sync, atomic rename, and
directory sync. Concurrent or stale writers fail without silently overwriting a
human decision.

## Dogfood evidence

The contract suite replays both issue-backed patterns without inventing a new
human result:

- the NXT-430 frontend pattern records a blocking human finding, binds a new
  exact revision and ready driver/runtime receipts, preserves unaffected PASS
  decisions, and resumes only the stale failure checkpoint and its dependents;
- the NXT-449 spike/document pattern preserves a conditional Product decision,
  participant identity, linked evidence, and the carried condition in the
  reusable checklist and final publication fork.

These are deterministic engine proofs. The actual human observations remain in
the issue's attributed dogfood records and are not recreated by automated tests.
