# Wheels Off delegated initiation

Wheels Off lets the Kernel authorize a qualifying mission from a standing,
signed Coulson delegation. It does not assign Coulson's seat to an AI and does
not authorize merge, deployment, release, or external effects.

## Grant or revoke

Construct a `WheelsOffDelegation` with `createWheelsOffDelegation(...)`. Its
`logSequence` must equal the next `.shield/delegations.jsonl` sequence. Sign
`canonicalDelegationJson(payload)` with the configured repository-wide Coulson
Ed25519 key, then record the envelope:

```sh
shield delegation grant --evidence delegation-grant.json
shield delegation revoke --evidence delegation-revocation.json
```

Revisions name `previousRevisionId`. Revocation names the exact active revision.
History is append-only; private keys never enter SHIELD.

## Begin delegated

Create a closed eligibility snapshot with `createWheelsOffEligibility(...)`.
It binds the exact repository, issue revision, mission revision, delegation
revision, scope, acceptance checks, resolved dependencies and architecture
decisions, requested implementation/review-publication authority, and Simmons
condition.

```sh
shield mission begin \
  --authorization delegated \
  --brief mission-brief.json \
  --delegation sha256:<exact-revision> \
  --eligibility eligibility.json
```

The Kernel evaluates a fixed ordered `wheels_off.v1` rule table. All mission risk
flags must be false. Coulson, Fury, and Fitz must be participants. Missing,
unknown, mismatched, revoked, superseded, risky, or ambiguous facts fail closed.

Eligible missions start with delegated authorization and approved governance.
Ineligible missions remain proposed and can use the unchanged signed
`shield mission approve` flow.

## Invalidate

When a material change is observed, record one closed reason:

```sh
shield mission invalidate --mission-id <id> --reason scope_changed
```

Invalidation removes delegated execution readiness and returns governance to
proposed. It is a fail-closed Kernel condition, not fabricated Coulson evidence.
Automatic monitoring and host reconciliation are deferred.
