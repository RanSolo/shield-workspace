# ADR 0002: Wheels Off is standing pre-authorization

- **Status:** Accepted for Issue #39
- **Decision owner:** Coulson
- **Architecture review:** Fury

## Context

Supervised missions require Coulson evidence for the exact mission revision before
execution becomes ready. Routine bounded work needs a lower-friction initiation
path without assigning Coulson's seat to Hill, an agent, a model, or an adapter.

## Decision

Wheels Off is standing pre-authorization, not seat delegation. Coulson signs a
closed `wheels_off.v1` delegation revision for one repository. Hill may submit a
canonical mission brief and eligibility snapshot. The Kernel applies a fixed,
ordered rule table and records the exact inputs and result.

The authority chain is:

```text
Coulson signed delegation
  -> Kernel verifies exact active revision
  -> Kernel evaluates closed eligibility facts
  -> mission journal records delegated result
  -> governance becomes approved only when every rule is satisfied
```

No model verdict, prompt, username, free-form assertion, delivery receipt, or
adapter state has authority meaning.

Delegation grants, revisions, and revocations are append-only in
`.shield/delegations.jsonl`. A revision explicitly supersedes the prior active
revision. Revocation is prospective for new missions and never rewrites mission
history. Existing missions can be stopped through signed pause/cancel evidence.

Delegated mission journals use schema v3. Existing supervised journals remain
schema v2 and replay without reinterpretation. A delegated journal records
`mission.begun` followed atomically by `authorization.delegated_evaluated`.
Eligible evaluation derives approved governance; ineligible evaluation remains
proposed and falls back to existing signed `mission approve`.

Material change is recorded with `authorization.delegated_invalidated`. It
returns governance to proposed and execution readiness to waiting without
fabricating a human pause. Automatic monitoring is deferred.

## Kernel ownership

The Kernel owns contract validation, signature/trust verification, eligibility
evaluation, authorization projection, replay, and invalidation meaning. Hill
supplies artifacts and invokes commands but never decides eligibility or
authority. Hosts may later gather facts but cannot change their Kernel meaning.

## Preserved gates

Wheels Off changes only mission initiation. Fury architecture review, Fitz human
technical review, conditional Simmons evidence, Coulson final PR review, and
Coulson-only merge authority remain required. Delegation never grants destructive,
production, credential/trust-root, external-communication, merge, deploy,
release, permission-widening, or scope-expansion authority.

## Consequences

The first policy is intentionally fixed rather than a policy DSL. Missing,
unknown, unresolved, risky, revoked, superseded, mismatched, or ambiguous input
fails closed. Broader policies require a new version and architecture decision.
