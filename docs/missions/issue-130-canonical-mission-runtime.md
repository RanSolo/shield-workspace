# Mission Brief — Issue #130 Canonical Mission Runtime Entry Point

## Objective

Identify and define the smallest supported, host-neutral entry point that
advances one real S.H.I.E.L.D. mission cycle by composing the existing journal,
supervision, routing, Helicarrier, runner, permission, tool-execution, adapter,
and durable-result boundaries.

The mission must distinguish the package API from an executable mission
runtime. It must not claim that isolated contracts, journal-only transitions,
or agent convention constitute an operational mission loop.

## Current evidence

The package exposes several partial execution seams:

- `shield mission begin|status|step|report` creates, reads, and appends durable
  mission journal state;
- `planMissionStep(...)` derives journal-only execution transitions;
- `runRunnerCycle(...)` performs one injected authorized cycle and returns a
  non-authoritative effect candidate;
- `runHelicarrierV0(...)` validates and compiles one dispatch;
- `runMayControlLoop(...)` performs one bounded local implementation loop;
- GitHub adapter functions perform bounded publication behavior;
- supervision constructors convert validated candidates into authoritative
  journal entries.

No documented public function or command currently composes those seams into a
real mission-advancing runtime. The public API documentation explicitly marks
general multi-cycle orchestration as unsupported.

## Scope

This mission may:

- audit public runtime functions, CLI paths, tests, and durable state;
- map each function to one runtime responsibility and authority boundary;
- determine whether the runtime should be organized by lifecycle stage,
  capability boundary, seat, or a documented combination;
- define one host-neutral, single-cycle orchestration contract;
- specify the Hill-ready context restored at each cycle;
- specify deterministic stop results for human gates and blocked states;
- add the smallest implementation and focused tests only after Fury approves
  the exact plan and Coulson authorizes implementation;
- select a bounded real issue for the first proving mission.

## Organization hypothesis

Runtime composition should primarily follow executable responsibility and
mission stage, not agent identity:

```text
load/replay
→ derive route
→ prepare dispatch
→ authorize effect
→ execute one cycle
→ validate and append result
→ project next state or human gate
```

Seat identity remains explicit in dispatch, permission, evidence, and receipt
records. This hypothesis must be tested against current module dependencies and
must not force a reorganization when a thin composition layer is sufficient.

## Required runtime result

The proposed entry point must return a closed result that distinguishes:

- advanced by one durably recorded cycle;
- waiting at a named human gate;
- blocked by missing or invalid authority, configuration, runtime, or adapter;
- stopped after an uncertain or failed effect;
- complete with no further eligible action.

It must never fabricate a seat dispatch, human decision, execution receipt, or
durable append.

## Durable starting context

Every cycle must restore enough authoritative context for Hill to prepare the
next handoff without relying on model memory:

- mission, repository, issue, subject, and exact revision identity;
- current journal projection and evaluated sequence;
- objective, scope, risk, participants, and activated modes;
- current authorization and runtime bindings;
- next eligible action and accountable seat;
- approved tools, effects, adapters, and validation obligations;
- evidence already recorded and evidence still required;
- explicit stop conditions and pending human gates.

## Acceptance criteria

- The audit maps every required runtime responsibility to current code or an
  explicit gap.
- The distinction between package API, host adapter, application HTTP API, and
  executable mission runtime is documented.
- One canonical starting function or command is identified or proposed.
- The contract composes existing authority and validation boundaries rather
  than duplicating them.
- The runtime advances at most one authorized cycle per invocation.
- Successful advancement requires durable journal append and verified readback.
- Hill receives a deterministic next-route context derived from durable state.
- Human gates are returned as stops and are never dispatched or simulated.
- Missing, stale, malformed, ambiguous, failed, or uncertain inputs fail closed.
- Focused contract, replay, restart, stale-state, and adversarial tests pass.
- One local-only proving mission is defined with an observable durable effect.
- Fury approves the exact final architecture and implementation revision before
  the Fitz human technical gate.

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: false
- externalCommunication: false
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

This is architecture-affecting runtime work and requires explicit Coulson
approval. It is not eligible for lightweight timeout activation.

## Participants and gates

- Hill: intake, dependency map, route design, scope control, and handoffs.
- Daisy: read-only recon of current runtime seams and missing composition.
- Fury: architecture threat review before implementation and exact-head
  conformance review afterward.
- May: sole production implementation owner after approval and Fury plan gate.
- Mack: independent focused and integration validation after implementation.
- Coulson: mission authorization, material scope decisions, and final authority.
- Fitz: human technical-review gate; never dispatched or simulated.

## Recommended mode

Delivery Mode is recommended because the mission may produce a public runtime
contract, implementation, tests, and documentation. It remains proposed until
Coulson approves this brief. Initial Daisy recon and Hill planning are
read-only intake activities and do not authorize implementation.

## Stop conditions

Stop and return to Coulson if the work requires:

- a server, scheduler, daemon, general multi-cycle loop, or Mission Control UI;
- new seat or human authority semantics;
- weakening or bypassing journal, permission, runner, Helicarrier, adapter, or
  review-publication validation;
- automatic merge, deployment, release, or production access;
- broad module reorganization not required by the thin orchestration seam;
- simulated human evidence or inferred authority;
- expansion beyond one host-neutral mission cycle.

## Activation status

Bootstrap slice approved by Coulson through the active human conversation at
`2026-07-29T13:46:50Z`: begin Mission #130 "meta style" by identifying and then
implementing `missionIntake(...)`, followed by self-intake of Issue #130.

This approval is human-directed session evidence, not signed or journaled
S.H.I.E.L.D. runtime evidence. The absence of a runtime-verifiable intake record
is part of the defect this mission must expose. It authorizes the bounded
bootstrap work but does not authorize simulated Fury/Fitz evidence, merge,
deployment, release, or scope expansion.
