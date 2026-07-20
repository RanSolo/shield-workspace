# Public package API

V0.3 exposes an intentional ESM package surface. Consumers may import only the
documented specifiers below; paths under `contracts/`, `adapters/`, `github/`,
and other package directories are internal even when included as data in the
package artifact.

| Specifier | Supported capability |
| --- | --- |
| `@shield/team-system` | Combined V0.3-2 contract and configuration surface |
| `@shield/team-system/mission` | Mission policy, records, validation, and replay |
| `@shield/team-system/journal` | Journal validation, serialization, parsing, and replay |
| `@shield/team-system/modes` | Mode manifests, registries, and seat-context resolution |
| `@shield/team-system/workspace` | Review-workspace validation and deterministic PR-body generation |
| `@shield/team-system/config` | Closed V0.3 repository configuration validation and doctor reports |
| `@shield/team-system/supervision` | Supervised journals v2-v6, canonical mission briefs, Ed25519 human evidence, readiness, communication, authoritative execution effects, and runtime-binding lifecycle |
| `@shield/team-system/delegation` | Closed Wheels Off v1 delegation, revocation, eligibility, and deterministic evaluation contracts |
| `@shield/team-system/adapter` | Closed host-neutral adapter v1 candidate, communication, and validation contracts |
| `@shield/team-system/runner` | Closed one-cycle runner v1 with an injected pre-executor authorization boundary, at-most-once executor dispatch, result validation, and journal-ready evidence candidates |
| `@shield/team-system/permission` | Closed three-identity runtime bindings, host-attestation inputs, pure per-call evaluation, audited #8 authorizer, and audited executor wrapper |
| `@shield/team-system/permission-audit` | Closed append-only decision/result records, record digests, append-receipt validation, and non-authoritative ledger replay |
| `@shield/team-system/github` | Journal-gated GitHub publication, exact draft-PR workspace receipts and Delivery Mode dispatch guard, attributed handoff rendering, and signed-evidence candidate translation |

All entry points provide TypeScript declarations. Existing `.mjs` contract
modules remain their runtime source of truth. The isolated TypeScript build
contains the additive configuration, CLI, and V0.3-4 supervision contracts; it
does not migrate or reinterpret the existing package runtime.

## Capability status

| Product-contract capability | V0.3-2 status |
| --- | --- |
| Mission records and governance | Supported through `/mission` |
| Mission journals and deterministic replay | Supported through `/journal` |
| Mode references | Supported through `/modes` |
| Review-workspace validation | Supported through `/workspace` |
| Repository configuration validation | Supported through `/config` |
| Bounded local human-evidence requirements and readiness | Supported through `/supervision` for the V0.3-4 mission-plan subject |
| One-cycle execution seam | Supported through `/runner`; authorization, execution, and result validation are injected by the caller |
| Runtime binding and per-call permission decisions | Supported through `/permission` for homogeneous supervised journal v6 missions |
| Permission/tool audit evidence | Supported through `/permission-audit`; durable storage is injected and the ledger is never authoritative |
| Host-adapter candidate envelope | Supported through `/adapter`; GitHub translation and delivery are supported through `/github` |

Unavailable capabilities are not exported as placeholders. Their absence is a
truthful boundary, not a future commitment.

Journal v1 remains supported through `/journal`. Journal v2 is additive and is
used only by the bounded supervised-mission workflow. Journal v3 adds Wheels
Off authorization, journal v4 adds communication requests and results, and
journal v5 adds completed or uncertain execution-effect records. Journal v6
adds Coulson-authorized runtime binding and atomic binding-supersession events.
Mixed-version journals, automatic migration, waivers, multi-cycle
orchestration, host probes, and permission brokers remain unsupported. The
runner returns a validated, non-authoritative v5 or v6 effect candidate; it does
not append entries or grant the candidate authority. The trusted supervision
boundary supplies the entry ID and timestamp, rechecks exact mission, subject,
revision, and sequence identity, and appends the authoritative record. Replay
then blocks both completed and uncertain effect keys from re-execution.

Journal v6 and `/permission` keep three identities separate: `seatId` carries
responsibility and authority, `reasoningRuntimeId` identifies the reasoning
runtime, and `toolExecutorId` identifies the host or runtime that invokes the
tool. Runtime and executor identities never grant seat authority. A fresh
decision exact-matches the active journal binding, mission and artifact
revisions, journal sequence, repository/root/branch, requested action/effect,
scope, and freshness-bounded host attestations. The authorizer returns `allow`
only after an injected atomic append-if-absent operation returns a matching
ledger receipt. The caller must source the context from authoritative replay
and serialize the final journal-head check through invocation. `/permission`
does not inspect the host or canonicalize paths; those remain broker concerns.

The audit ledger contains operational evidence only. Its receipt may veto or
consume a call, but neither a receipt nor ledger replay can grant authority,
change readiness, supersede a runtime binding, or redefine mission state.

Delegated missions use journal schema v3 while schema-v2 supervised journals
remain supported without reinterpretation. Wheels Off exposes standing
pre-authorization only; it does not grant runner execution, define a policy DSL,
perform host inspection, or confer merge/deploy/release authority.

## Compatibility and breaking changes

V0.3 consumers must pin an exact package version. Within one exact version, the
documented specifiers, runtime behavior, and declarations are supported
together. Undocumented paths are unsupported and may change without notice.

Removing or renaming a documented specifier, narrowing accepted input that was
previously supported, changing a documented return shape, or changing a schema
version is a breaking change. A breaking change requires an explicit version
change, migration guidance where durable data is affected, and Coulson release
authorization. Adding a new documented specifier does not make an unavailable
capability supported until its runtime, declarations, documentation, and packed
consumer validation ship together.
