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
contract is intentionally `authority: none`: it remains useful as an advisory
projection, but it is not sufficient publication evidence. The profile-aware
`mission prepare-next` host owns the Yes/No/Cancel choice. A Yes route requires
a content-addressed publication bundle carrying the complete playbook and
completed session bytes. The bundle also binds the mission, subject,
repository, branch, exact HEAD, protected graph, transition plan, Fury review
evidence, and protected policy mode. A No route is constructed by the host from
that protected policy; callers cannot downgrade a required review by supplying
a different local plan. Cancel stops before decision rendering or passcode
access.

The publication decision displays the bundle, plan, session, and fork
identities and embeds the bundle digest in the signed authorization
`sourceRef`. The same single PIN binds the selected Guided Review route and
exact review-candidate publication. The host revalidates the protected graph,
repository, journal, signer, and exact bundle bytes before and after signing.
Missing, incomplete, substituted, malformed, or stale evidence fails closed.

The expensive route preparation is deliberately lazy. The operator first
chooses whether to enter Guided Review. `no` proceeds directly to the ordinary
publication PIN when omission is permitted, and `cancel` has no effect. Only a
`yes` choice creates an authority-neutral route request for Fury. Fury supplies
the small mission-specific overlay: acceptance-criterion mappings, risks,
inspection points, and unusual route adjustments. A deterministic compiler
expands that overlay against the pinned Backend, Frontend, or Spike template.
The human session then asks the already-prepared questions one at a time; it
does not invoke a model or ask the reviewer to invent the route while reviewing.

## Durable CLI

Freeze the required-or-omitted plan first:

```bash
shield guided-review plan create \
  --input .shield/tmp/guided-review/plan-input.json \
  --output .shield/tmp/guided-review/plan.json
```

Standalone exploration may create a standard playbook from a closed context
containing that plan:

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
`publication-choice` freezes a non-authoritative Yes/No/Cancel fork artifact.
At a publication gate, `yes` does not accept a caller-created playbook or
session. On the first invocation Hill supplies the closed route context. The
host freezes an authority-neutral, content-addressed request and stops for
Fury route preparation:

```bash
shield mission prepare-next \
  --mission-id mission:example \
  --guided-review-choice yes \
  --guided-review-context .shield/tmp/guided-review/context.json
```

The context contains the already-governed plan, acceptance criteria, runtime
handoff, participant relationship, and selected built-in kind. Mission,
repository, graph, policy, and exact-HEAD identities come from the prepared
publication state rather than that file.

After the completed Fury dispatch has produced the exact overlay, repeat the
same `yes` choice without the context. The host automatically resolves the
request and dispatch evidence, compiles and freezes the route, and opens or
resumes the next one-question checkpoint:

```bash
shield mission prepare-next \
  --mission-id mission:example \
  --guided-review-choice yes
```

Each invocation displays the complete current checkpoint, question,
instructions, relevant paths, evidence and acceptance-criterion references,
plus Fury's route rationale and risks. Record exactly one current answer on the
same command and receive the next question without constructing a separate
session command:

```bash
shield mission prepare-next \
  --mission-id mission:example \
  --guided-review-choice yes \
  --guided-review-answer PASS \
  --guided-review-question-digest sha256:DISPLAYED_DIGEST
```

Bare `PASS` records the exact observation `PASS`; the host does not generate
review prose. `FAIL` and `NOT_OBSERVED` require exactly one
`--guided-review-finding`, while `CONDITIONAL_PASS` requires exactly one
`--guided-review-condition`. If that follow-up is absent, the command returns
`follow_up_required` without changing the session. The same command resumes
one question at a time until the session is complete. It does
not read a PIN or append mission authority while another question remains.
Only completion displays the combined Guided Review/publication decision and
requests the one final PIN. Every pre-display and post-signature reload re-resolves the request,
Fury dispatch, overlay, compiled playbook, session, repository, graph, and
exact HEAD using a strictly read-only path. Once initialization has frozen either
the playbook or session, a missing request, overlay, playbook, or session is
deletion drift: reload never recreates it and produces no journal append.

For an eligible No route, omit the bundle; the host derives the record from the
protected transition policy. `--guided-review-choice cancel` stops before PIN.
In an interactive terminal, omitting the choice presents
`Enter Guided Review? Yes / No / Cancel`.

## Current-step local projection

An active publication Guided Review also materializes
`current-projection.json` inside the content-addressed route-request package.
The closed `guided.review.projection.v1` document is explicitly
`authority: "none"` and `durability: "ephemeral"`. It binds the planning base,
review base, exact attached branch and HEAD, request, compiled route, Fury
overlay, playbook, session digest, stage, checkpoint, and current step.

Behavior groups contain only bounded repository-relative literal targets and
structured `git` argv descriptors. They are local navigation aids, not review
evidence or publication authority. The host refuses symlinked, hard-linked,
non-0600, stale-HEAD, detached-branch, and non-descendant projections. A stale
or unavailable projection never rewrites the durable session, never rolls back
an accepted answer, and is not included in the publication bundle or PIN turn.

## Exact question and answer envelopes

Every hosted current question is displayed as a content-addressed
`guided.review.question.v1` envelope. Its digest binds the exact repository
revision, route request, session digest, stage, checkpoint, step, and current
local projection digest. Submit that displayed digest with either
`--guided-review-response` or the compatibility `--guided-review-answer` flag:

```bash
shield mission prepare-next \
  --mission-id mission:example \
  --guided-review-choice yes \
  --guided-review-response PASS \
  --guided-review-question-digest sha256:DISPLAYED_DIGEST
```

The grammar accepts one ASCII token—`PASS`, `FAIL`, `NOT_OBSERVED`, or
`CONDITIONAL_PASS`—case-insensitively with outer space or horizontal-tab only.
Punctuation, prose, multiple tokens, Unicode lookalikes, and line breaks return
`confirmation_required` before projection refresh, session revalidation, or
CAS, without changing journal, session, or ephemeral projection bytes. Missing
findings or conditions return only the exact required follow-up through the
same zero-mutation path. A complete answer revalidates the displayed question
against the exact repository/session context without requiring
`current-projection.json`; deletion of that ephemeral display aid cannot reject
an otherwise current answer. PASS is durably recorded
as the canonical exact bytes `PASS` with no generated prose. Legacy answer,
disposition, and observation flags are rejected unless accompanied by the same
explicit displayed question digest. The hosted output labels automated tests
and checks as unavailable unless the host securely reads the deterministic
`automated-check-source.json` from the exact content-addressed route package.
Callers cannot inject receipts through the question input. The source is a
closed content-addressed `guided.review.automated-check-source.v1` advisory
observation (`authority: "none"`), bound to mission, repository ID and canonical
root, request, session, and exact revision. The host projects closed
`guided.review.automated-check.v1` receipts whose provenance records the exact
host-read source bytes and whose `sourceByteSha256` binds those bytes. Missing
or unreadable sources render unavailable; malformed, non-canonical, tampered,
wrong-session, or wrong-revision sources fail closed and never render a passed
outcome. This follows the existing command-evidence posture: structural
traceability without producer authentication or gate authority.

`guided.review.follow-up.v1` is the pure deterministic handoff for a recorded
finding. It preserves the exact finding and source-decision identity, with
optional closed parent/linked issue identities. Its frozen `authority: "none"`
and `effect: "external_issue_creation_not_authorized"` fields explicitly grant
no network adapter, issue creation, or other external effect. Repeating the
same input returns the same `followUpDigest`.

Route requests, Fury overlays, compiled playbooks, sessions, fork artifacts,
runtime handoffs, and publication bundles are content-addressed. Session updates
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

These are deterministic engine proofs, not real UI or non-UI dogfood missions.
The current Mack-shaped check is host-asserted, non-authoritative validation;
the installed participant registry does not make that evidence Mack human or
journal authority. Actual human observations and named dogfood records must be
captured separately before the issue is treated as complete.
