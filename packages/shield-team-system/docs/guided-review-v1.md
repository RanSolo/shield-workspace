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

### Product QA

Product QA walks through ticket intent, representative success/failure/recovery
behavior, automated regression meaning, the reusable QA checklist, and the
exact candidate. Frontend drivers may use reviewed Cypress tests; backend
drivers may use representative request, job, CLI, or library checks. Driver
GREEN is technical evidence and never fabricates the human observation.

### Code review

Code review walks through ticket mapping, scope, architectural fit, state and
external effects, maintainability, test meaning, exact-revision GREEN evidence,
risks, limitations, and the named exact-candidate disposition. It does not
substitute one configured seat for another or grant merge, deployment, or
release authority.

### Document/spike review

Document review walks through placement and purpose, summary, acceptance
mapping, linked example folders/files, comparison quality, recommendation
conditions, accumulated corrections, and the exact document candidate. This is
the playbook for discovery records, ADRs, scorecards, and Confluence drafts.

## Profiles

- `exploration` permits an incomplete or blocked runtime handoff and produces
  non-authoritative learning evidence.
- `acceptance` requires a builder-produced `ready` runtime receipt bound to the
  candidate revision.
- `publication` has the same runtime requirement and can become eligible for
  the publication fork only after every stage passes.

Routine dependency, environment, fixture, binding, port, health, external-
effect policy, teardown, and recovery work belongs in the builder runtime
handoff. The first human checkpoint begins after that receipt says ready.

## Plan selection

Before a playbook or omission route exists, the plan records `required`, a
reviewable rationale, method, covered acceptance-criterion references, evidence
requirements, exact revision, playbook kind, and `gateOwnerSeatId: coulson`.
A required plan must name at least one criterion and evidence requirement. A
playbook can only be built from a required plan with the same mission, subject,
kind, and revision. A safely omitted plan remains inspectable and is the only
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
  --kind product_qa \
  --input .shield/tmp/guided-review/context.json \
  --output .shield/tmp/guided-review/playbook.json
```

Start and display the first question:

```bash
shield guided-review start \
  --playbook .shield/tmp/guided-review/playbook.json \
  --profile publication \
  --session-id session:example \
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
