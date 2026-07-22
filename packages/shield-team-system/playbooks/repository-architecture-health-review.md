# Repository Architecture Health Review Playbook

Use this playbook for a scheduled, evidence-only review of architectural
health. It is an operating procedure, not a runtime contract, permission rule,
or automatic governance transition.

## Purpose

Find responsibility drift, duplicated contracts, unstable coupling, stale
assumptions, and temporary workarounds that may have become structural. The
review informs Fury and Coulson; it does not authorize implementation.

## Advisory triggers

Maria Hill may recommend a review when one or more of these conditions holds:

- four to six production issues have completed since the last review;
- a certification or benchmark cycle has completed;
- a major contract version is about to be frozen;
- several issues repeatedly modify the same files or boundaries;
- Hill or Fury repeatedly finds the same class of architectural defect.

These are recommendations, not automatic dispatch conditions. The Helicarrier
may later detect trigger evidence, but it must never authorize or launch a
review. Coulson decides whether the review begins.

The first scheduled review remains parked until PRs #88, #89, and #90 reach
final disposition.

## Roles and boundaries

Maria Hill owns intake, trigger assessment, scope, and report coordination.
Daisy Johnson performs bounded reconnaissance and supplies evidence only.
Nick Fury evaluates material findings and decides whether they warrant
architecture work, technical debt, or no action. Phil Coulson decides whether
to authorize the review and any resulting mission. Melinda May does not receive
implementation work from this playbook.

Daisy must not edit files, redesign modules, create implementation plans, or
open issues solely from an unreviewed observation. A finding may be proposed
for backlog reconciliation only after its evidence and classification are
recorded and Fury has dispositioned it.

## Daisy evidence-only scope

Daisy inspects the repository and backlog for:

- dependency and coupling hotspots;
- duplicated validation, policy, or schema logic;
- oversized or unstable modules;
- imports that contradict stated ownership boundaries;
- temporary workarounds that have become structural;
- stale documentation, contracts, or issue assumptions;
- unclear ownership between Hill, the Helicarrier, notebooks, and runtimes;
- recurring review findings;
- tests that enforce accidental rather than intentional architecture.

The inspection is read-only. Daisy reports observations and does not prescribe
a broad refactor or weaken an existing contract to make the repository appear
more decomposed.

## Required finding classification

Every finding receives exactly one classification:

1. **Baked-in framework behavior** — intentional behavior already owned by the
   framework and supported by current contracts.
2. **Session-provided behavior** — behavior supplied by a mission, prompt,
   fixture, or temporary operating context rather than the framework.
3. **Temporary workaround** — a bounded expedient that may be retired, but is
   not yet evidence of a framework defect.
4. **Framework defect** — an implementation or contract failure that violates
   an approved framework boundary or acceptance criterion.

Classification is evidence-based. Uncertainty is recorded as a limitation and
does not become a framework defect by default.

## Evidence requirements

Each finding must include:

- exact file, symbol, test, issue, or review reference;
- the observed behavior and the stated contract or ownership boundary;
- dependency or repetition evidence sufficient to reproduce the observation;
- affected seat, platform, or issue owner;
- classification and confidence;
- existing issue or PR references, when already tracked;
- whether the observation is new, duplicate, stale, or contradicted by newer
  evidence.

Do not include secrets, private reasoning, or unverified attribution.

## Duplicate and stale finding handling

Before proposing a new backlog item, Hill reconciles the finding against open,
closed, and parked issues, recent PRs, mission reports, and existing contract
documentation. Merge duplicate evidence under the oldest or most authoritative
tracking item. Mark stale assumptions as superseded rather than reopening them.
Preserve the evidence trail and explain why a finding was merged, closed, or
left informational.

No issue is expanded merely because Daisy found an adjacent idea. A material
scope change becomes a separate issue or returns to Coulson for a roadmap
decision.

## Fury disposition gate

Fury reviews each material finding against the approved architecture and assigns
one disposition:

- **Architecture issue** — a boundary, authority, contract, or platform change
  is warranted;
- **Technical-debt issue** — an implementation cleanup is useful without
  changing architecture or authority;
- **No action** — behavior is intentional, session-provided, already tracked,
  or insufficiently evidenced.

Fury may request more bounded evidence from Daisy. Fury does not authorize
implementation, change mission scope, or grant runtime permission. Coulson
authorizes any follow-on mission.

## Expected report

Hill returns a report containing:

- trigger evidence and review scope;
- repository revision and inspection limits;
- a finding table with evidence, classification, owner, confidence, and
  duplicate/stale status;
- recurring patterns and responsibility-boundary observations;
- Fury's disposition for every material finding;
- backlog reconciliation actions and links;
- explicit no-action and unresolved limitations;
- recommended next steps requiring separate Coulson decisions.

The report is historical evidence. It does not itself modify runtime behavior,
mission state, authority, certification, or governance.

## Completion and follow-up

Hill closes the review when every finding is classified, duplicate handling is
recorded, and Fury has dispositioned material findings. Any approved follow-on
work starts as a separate mission with its own Mission Brief, scope, review,
and authorization. The trigger cadence and report format remain advisory until
several completed cycles demonstrate that they are stable enough for a future
architecture decision.
