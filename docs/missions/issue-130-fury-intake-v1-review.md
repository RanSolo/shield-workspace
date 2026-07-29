# Mission #130 — Fury Review of `missionIntake v1`

## Review identity

- Seat: Fury
- Reviewed revision: `32dbb4e90211f98efe9c56e397c03e0b658a19fe`
- Verdict: `REVISE`
- Scope: architecture review only
- Authority: advisory mission-planning review; no human approval, implementation,
  publication, merge, or deployment authority
- Dispatch mechanism: direct host subagent dispatch and await
- S.H.I.E.L.D. runtime participation: none
- Formal gate status: not a `fury.plan-gate.v1` record because no verified
  journal or draft-PR Mission Workspace supplied the dispatch and gate evidence

## Required revisions

### Repository and issue identity

The candidate must retain normalized repository and issue observations,
including assertion provenance and `issueObservation.observedAt`. Artifact
references must bind to the observed repository HEAD. The contract must define
and enforce the relationship between the proposed brief subject and observed
issue.

### Configuration provenance

Raw `config` is ambiguous. Replace it with a closed configuration observation
that distinguishes repository-observed configuration, an explicitly labelled
bootstrap input, and missing configuration. Preserve that distinction in the
result. Missing repository configuration must create an explicit provisioning
blocker or blocked result.

### Mack participant contradiction

Mack is not in the current supported-seat configuration contract. Remove Mack
from the v1 dogfood participant fixture and represent Mack validation as an
external validation capability. Adding Mack as a configured mission seat
requires a separate human seat-model decision.

### Validation order

Descriptor-safely normalize the complete request before existing constructors
read it. Construct and validate the brief before classifying its validated risk
flags. Malformed risk input must return `INVALID_RISK_FLAGS`, never a valid
high-risk candidate.

The normalizer must reject accessors, hostile proxies, sparse arrays, symbols,
non-plain prototypes, and extra array properties.

### Lifecycle action

`await_coulson` is not an authoritative next action before a journal exists.
Keep pending human gates as a non-authoritative preview. Return
`provision_repository` or `initialize_journal` until journal initialization and
verified replay establish an authoritative human requirement.

### Mission scope

`missionIntake` is Issue #130 milestone one. Dogfooding it proves executable
intake participation only; it does not satisfy the mission's durable
single-cycle orchestration acceptance criteria.

### Public symbol

Freeze the exact public function name before implementation.

## Accepted architectural properties

- Human decisions remain requirements rather than generated evidence.
- Recommendations do not activate modes.
- Runtime observations do not authorize dispatch.
- Intake admits no model, tool, journal, adapter, or publication effect.
- Candidate persistence is labelled non-authoritative.
- Existing brief revision and evidence-requirement constructors remain
  authoritative.

## Unresolved human decision

Should Mack become a first-class dispatchable mission seat, or remain an
independent validation capability outside the configured participant set?

This does not block intake v1 if Mack is removed from its fixture. It does block
any later runtime claim that a mission can be routed to Mack.

## Route

Return to Hill for exact contract corrections, then dispatch the committed
revision back to Fury. Route to the human sponsor only if the Mack seat model
must change now.

## Re-review of `39205352db25fcc342dfbd716fd586ea8137b35b`

Verdict: `REVISE`.

The first revision satisfied the repository/issue/artifact provenance, Mack,
normalization order, human-gate preview, public-symbol, and milestone-scope
findings. Fury returned three residual corrections:

1. bind repository-file configuration observations to the observed HEAD and
   test stale revisions;
2. either introduce a shared typed risk validator or map malformed risk input
   to `INVALID_BRIEF_INPUT` without parsing validator messages;
3. freeze exact string and collection bounds.

Hill selected the smaller existing-interface path: malformed risk data maps to
`INVALID_BRIEF_INPUT`. No new public risk validator is introduced by intake v1.
The other two corrections are incorporated into the revised plan before a
third Fury review.
