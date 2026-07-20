# Runtime Binding and Permission Boundary

Issue #10 adds a deny-by-default permission boundary at the one-cycle runner's
injected `authorize(plan)` seam. It does not add a tool broker, host probes, a
model runtime, routing, or analytics products.

## Identity model

The contract keeps three identities distinct:

- `seatId` identifies mission responsibility and authority.
- `reasoningRuntimeId` identifies the runtime performing reasoning.
- `toolExecutorId` identifies the runtime or host that invokes the tool.

A runtime or executor is not a seat and never inherits seat authority. Runtime
and executor identifiers therefore cannot be represented by the seat
identifier. Audit records preserve all three fields and attribute tool results
to the actual executor.

## Authoritative binding lifecycle

The Mission Journal is the only authoritative record of binding state. A
homogeneous journal v6 may contain:

- `runtime.binding_recorded` for an initial active version-1 binding; and
- `runtime.binding_superseded` for one atomic replacement of the active version.

Both entries require a separate Ed25519 Coulson authorization over the exact
binding digest, mission and subject, binding ID/version, prior binding
ID/version, mission and artifact revisions, and immediately next journal
sequence. Supersession retains the binding ID, increments the version by one,
and makes the prior version inactive without an intermediate unbound state.
Replay may validly derive no binding before the initial event. Permission
evaluation denies when it cannot derive exactly one active binding for the
mission, subject, and seat.

Journal versions v2 through v5 replay without synthesized binding state or
reinterpretation.

## Per-call evaluation

The pure evaluator exact-matches the runner plan and authoritative v6 context
against the active binding:

- mission, subject, seat, and mission revision;
- reasoning runtime and tool executor;
- binding ID/version and exact artifact revision;
- repository identity, canonical writable root, and branch;
- journal sequence, action, effect class, and exact effect key;
- approved required capabilities; and
- one fresh repository-root attestation, one fresh writability attestation,
  and one fresh attestation for each required capability from the same host.

Attestations are host-observed operational inputs. They never grant governance,
readiness, seat authority, or binding state. Canonical path discovery and the
probes that produce attestations belong to the host/broker layer.

## Audit and single use

The authorizer constructs a closed decision record and calls the injected
atomic append-if-absent operation. It returns `allow` only after validating a
receipt bound to the ledger ID/sequence, record ID, decision ID, and exact
record digest. The durable operation is the single-use consumption boundary;
an in-memory set is not sufficient across restarts or concurrent hosts.

The audit ledger is append-only operational evidence. It cannot grant
authority, change readiness, alter the active binding, or supersede Mission
Journal state. Replay rejects duplicate decision use, multiple results for one
decision, results without a preceding decision, and any seat/runtime/executor
or other identity drift between the decision and result.

The audited executor re-reads and exact-matches the v6 context and structured
permission artifact immediately before invoking the underlying tool. Hosts
must serialize this check-through-invocation interval against journal-head
changes. A changed binding, revision, runtime, executor, repository, scope, or
sequence prevents the underlying call. Failure to durably record a result
converts the result to `uncertain` for Coulson rather than claiming completion.

## Fail-closed matrix

| Condition | Result |
| --- | --- |
| Missing or ambiguous active binding | Deny |
| Superseded, stale, malformed, or unknown binding data | Deny |
| Seat, runtime, executor, repository, root, branch, revision, or sequence mismatch | Deny |
| Action, effect class/key, or capability outside exact approved scope | Deny |
| Missing, duplicate, conflicting, cross-host, mismatched, or stale attestation | Deny |
| Malformed structured artifact or changed context at executor preflight | No underlying tool call |
| Duplicate decision or unverifiable pre-call append receipt | No underlying tool call |
| Executor result audit cannot be durably verified | Uncertain; route to Coulson |

Malformed or hostile contract inputs return invalid or non-allow results without
invoking accessors. Records contain identifiers and bounded reason codes, not
credentials, private reasoning, or raw executor output bodies.
