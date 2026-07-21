# Mission Brief: Issue #67 Hill-controlled specialist iteration

- **Mission:** `mission:issue-67`
- **Subject:** `issue:67`
- **State:** Wheels Up by direct Coulson instruction
- **Mode:** Delivery Mode
- **Human authority:** Phil Coulson
- **Orchestration and routing owner:** Maria Hill
- **Reconnaissance seat:** Daisy Johnson
- **Implementation owner:** Melinda May
- **Architecture and conformance reviewer:** Nick Fury
- **Final technical reviewer:** human Fitz seat
- **Merge, deployment, and release authority:** Coulson only

## Objective

Replace count-driven repair escalation with a closed, evidence-based policy that
validates Hill's requested specialist route after every handoff. Routine later
iterations remain within the approved mission when the objective is unchanged,
the requested route is supported by new concrete evidence and observable
progress, risk does not materially increase, and the same unresolved failure is
not merely repeating.

Issue #42 remains parked at its merged executor prerequisite. After #67 is
accepted, its bounded LM Studio May loop will prospectively exercise this policy.

## Frozen architecture

### Advisory readiness

`hill.readiness.v1` remains non-authoritative. A refinement-required assessment
always returns `NEEDS_REFINEMENT` to the immutable artifact owner, independent
of the number of prior refinements. `refinementPassesCompleted` remains bounded
telemetry, not a permission or escalation input.

Issue #67 explicitly supersedes the one-refinement limit designed in Issue #58.
Historical Issue #58 mission and benchmark artifacts remain unchanged.

### Iteration policy

The mission-policy package exposes a new closed `evaluateSpecialistIteration`
contract. Hill supplies one requested disposition:

- `return_same_owner` for a directly coupled correction;
- `reroute` when evidence shows that the problem category changed;
- `advance` when the current gate's validation obligations are satisfied;
- `escalate_coulson` for a material decision or designated human gate.

The policy validates Hill's request; it does not independently infer mission
facts or create authority. The input binds the mission objective, current owning
seat, proposed next seat, and closed evidence booleans.

Any material scope change, material risk increase, authority decision,
destructive or external effect, unresolved tradeoff, or final human gate returns
`escalate_coulson`. Missing, malformed, contradictory, or unsupported evidence
fails closed. A stalled iteration returns `hold_for_evidence` without escalating
merely because a count was reached.

The former `authorizeRepair` count-and-hard-cap API is removed from the public
surface. No compatibility adapter may preserve count-based authority semantics.

## Bounded continuation invariants

Hill may return work to the same specialist only when:

- the approved objective is unchanged;
- the owning seat and artifact ownership are unchanged;
- the cycle responds to new concrete evidence;
- observable progress exists;
- risk has not materially increased; and
- the same unresolved failure is not merely repeating.

Hill may reroute only when the objective remains unchanged, new evidence exists,
the problem category changed, and the proposed next seat differs from the current
owner. Hill may advance only when the objective remains unchanged and the current
validation gate is satisfied.

## Material Coulson gates

Coulson remains required for:

- objective, requirement, or material scope changes;
- material security, migration, production, destructive, external, or data risk;
- authority creation, expansion, substitution, or ambiguous ownership;
- unresolved tradeoffs or conflicting valid approaches;
- merge, deployment, release, and explicitly designated final human gates.

## Documentation boundary

Update only active governance sources:

- shared charter and Coulson/Hill seat instructions;
- mission-mode loading rules;
- begin-mission playbook and Mission Brief template;
- authoritative Hill readiness specification and public API documentation.

Historical mission dossiers and benchmark evidence remain immutable. #67 records
their supersession instead of rewriting prior experimental history.

## Validation obligations

- Focused policy tests cover every disposition, malformed and contradictory
  evidence, material escalation precedence, and stall-without-count behavior.
- A deterministic scenario proves second and later May corrections remain
  eligible when each cycle has new evidence and observable progress.
- Hill readiness tests prove refinement counts greater than one remain advisory
  telemetry and never force escalation.
- Agent, mode, playbook, template, public declarations, and packed-consumer tests
  reject the former count/hard-cap language and expose the new contract.
- Full team-system and workspace tests pass.

## Benchmark telemetry

The prospective #42 exercise must record:

- wall-clock duration;
- Hill disposition decisions and reasons;
- specialist cycles by owning seat;
- Fury correction cycles;
- human interventions and gate type;
- context bytes or lines supplied when observable;
- local input, output, reasoning, and time-to-first-token metrics;
- premium-model usage when observable; and
- overall usage cost as exact, estimated, or not observable.

## Early Fury threat review

The design must fail if Hill attempts to disguise changed scope as iteration,
reroute without category-change evidence, advance without validation, continue a
repeating failure, or bypass a material/final Coulson gate. Iteration eligibility
must never grant tool authority, modify mission state, transfer artifact
ownership, or override per-call permission enforcement.

## Stop conditions

Stop for Coulson if implementation requires Kernel changes, new journal authority,
automated dispatch, tool permission changes, runtime substitution, a new seat,
rewriting historical evidence, destructive/external effects, or a broader
adaptive-routing system. Stop for Fury if the policy can be used to bypass a
material gate or if advisory Hill evidence becomes authoritative.

## Acceptance criteria

- Fixed repair-count and hard-cap escalation is absent from active contracts,
  charter, modes, playbooks, templates, declarations, and tests.
- Hill owns the evidence-based disposition after each specialist handoff.
- The same closed routing model applies to Daisy, Fury, May, and future seats.
- Routine second and later corrections do not require Coulson solely due to
  iteration count.
- Material decisions and final human gates still require Coulson.
- #42 remains unchanged during this mission.
