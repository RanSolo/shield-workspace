# ADR 0001: Define the SHIELD Kernel Boundary

- **Status:** accepted
- **Date:** 2026-07-18
- **Decision authority:** Phil Coulson
- **Scope:** K2-4.5, issue #23

## Context

SHIELD must preserve the same mission meaning when work moves among GitHub,
Jira, VS Code, Teams, Slack, Zoom, manual operation, or future hosts. A transport
can carry a statement, but transport success is not authority and cannot prove
that a human made a decision.

The existing mission journal is authoritative and replayable, with governance
and execution already represented as independent projections. K2-4.5 establishes
the constitutional boundary required before adding evidence gates and readiness.

## Decision

Apply this test to every proposed capability:

> A capability belongs in the kernel only if changing adapters, runners, models,
> or hosts must not change its meaning.

### Kernel ownership

The kernel owns:

- versioned mission contracts and their closed validation rules;
- human-authority seat definitions and permission decisions;
- trusted binding validation, without performing identity-provider operations;
- evidence requirements, evidence-record validation, and satisfaction decisions;
- revision identity, supersession, and deterministic waiver semantics;
- readiness derivation and failure reasons;
- deterministic replay of authoritative journal events; and
- the authoritative meaning and ordering of the mission journal.

### Explicit exclusions

The kernel does not own:

- communication delivery or delivery acknowledgements;
- GitHub, Jira, VS Code, Teams, Slack, Zoom, or other host semantics;
- polling, timers, scheduling, retries, notifications, or escalation delivery;
- model selection, model invocation, prompts, or provider routing;
- runner dispatch or tool execution;
- user interfaces or presentation state; or
- filesystem, network, deployment, release, or other external effects.

### Representative applications of the Kernel Test

| Capability | Kernel? | Reason |
| --- | --- | --- |
| Human authority | Yes | Human authority must mean the same thing everywhere. |
| Evidence validation | Yes | Validity cannot depend on a transport. |
| Readiness derivation | Yes | It is a pure projection of mission truth. |
| Permission decisions | Yes | The same action must require the same authority everywhere. |
| Deterministic replay | Yes | One journal must produce one meaning in every environment. |
| GitHub comments | No | They are host-specific communication. |
| Jira tickets | No | They are host-specific communication. |
| Model routing | No | It is replaceable runtime policy. |
| Zoom meetings | No | They are communication behavior. |
| File edits | No | They are effects outside mission truth. |

## Adapter guarantees

Every adapter must:

1. translate host input into a versioned kernel candidate without assigning
   authority, satisfaction, readiness, or completion;
2. preserve the source reference and raw provenance needed for audit;
3. identify the trusted binding used when it claims a human-originated input;
4. submit candidates to the kernel and accept the kernel verdict unchanged;
5. preserve mission, subject, and revision identifiers without inference;
6. treat replayed kernel output as authoritative over cached host state; and
7. report delivery success or failure only as communication state.

An adapter cannot convert a username, role label, comment, emoji, ticket state,
meeting attendance, or delivery acknowledgement into human authority by itself.

## Runner obligations

Every runner must:

1. obtain a current kernel permission decision before an effect;
2. respect `deny` and `wait` without substituting policy;
3. use the exact mission, subject, and revision evaluated by the kernel;
4. never synthesize human decisions or trusted bindings;
5. never infer approval from silence, elapsed time, delivery, or execution state;
6. append candidate facts and effect receipts through the journal contract; and
7. re-evaluate permission when the journal advances or a revision changes.

## Immutable principles

- Human authority cannot be fabricated or delegated to an agent, model, adapter,
  runner, or host.
- Coulson governs mission authorization. Fitz is human technical-review
  authority. Simmons is conditional human product/domain authority.
- Evidence is explicit, exact-revision-bound, provenance-bearing journal data.
- Missing, stale, malformed, ambiguous, inherited, or conflicting evidence fails
  closed.
- A new revision supersedes approval of an older revision.
- Waiver and supersession are explicit journal events, never inference.
- Governance, execution, readiness, and communication are separate projections.
- Delivery failure is a communication condition, never approval or rejection.

## Consequences

All host integrations, beginning with GitHub, must use one host-neutral adapter
contract. Host convenience may change presentation and delivery, but not kernel
meaning. The kernel will require explicit contracts and additional journal event
types before K2-4.5 semantics can be implemented at runtime.

This ADR does not change journal schema v1. Runtime implementation is held for a
separately authorized mission.
