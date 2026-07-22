# Public package API

V0.3 exposes an intentional ESM package surface. Consumers may import only the
documented specifiers below; paths under `contracts/`, `adapters/`, `github/`,
and other package directories are internal even when included as data in the
package artifact.

| Specifier | Supported capability |
| --- | --- |
| `@shield/team-system` | Combined V0.3-2 contract and configuration surface |
| `@shield/team-system/mission` | Mission policy, records, validation, replay, and non-authoritative evidence-based specialist-iteration eligibility |
| `@shield/team-system/journal` | Journal validation, serialization, parsing, and replay |
| `@shield/team-system/modes` | Mode manifests, registries, and seat-context resolution |
| `@shield/team-system/workspace` | Review-workspace validation and deterministic PR-body generation |
| `@shield/team-system/hill-readiness` | Pure advisory `hill.readiness.v1` classification for exact seat-owned artifact revisions using closed, host-asserted evidence |
| `@shield/team-system/config` | Closed V0.3 repository configuration validation and doctor reports |
| `@shield/team-system/supervision` | Supervised journals v2-v6, including authoritative runtime-binding lifecycle, canonical mission briefs, Ed25519 human evidence, readiness, communication, and execution-effect replay |
| `@shield/team-system/delegation` | Closed Wheels Off v1 delegation, revocation, eligibility, and deterministic evaluation contracts |
| `@shield/team-system/adapter` | Closed host-neutral adapter v1 candidate, communication, and validation contracts |
| `@shield/team-system/runner` | Closed one-cycle runner v1 with an injected pre-executor authorization boundary, at-most-once executor dispatch, result validation, and journal-ready evidence candidates |
| `@shield/team-system/permission` | Closed runtime bindings, host attestations, deny-by-default per-call evaluation, verified authorizer, and fresh executor preflight |
| `@shield/team-system/permission-audit` | Closed digest-bound decision/result evidence, exact append receipts, and non-authoritative ledger replay |
| `@shield/team-system/local-tools` | Host-side Daisy read-only broker plus the bounded May write, validation, and LM Studio control-loop executor, with injected Issue #10 authorization/audit dependencies |
| `@shield/team-system/github` | Journal-gated GitHub publication, exact draft-PR workspace receipts, the non-authoritative `fury.plan-gate.v1` evaluator and Delivery Mode dispatch guard, attributed handoff rendering, and signed-evidence candidate translation |

The pre-1.0 Delivery Workspace guard requires explicit mission/subject,
May-owned blueprint, and `planGate` inputs. Literal `null` creates or reuses the
early draft workspace and returns `workspace_ready`; only an exact eligible
Fury plan gate returns `dispatch_ready`. Callers must discriminate those states
literally. The gate is stateless host-asserted evidence: it does not provide
global replay prevention, authenticated provenance, durable consumption,
semantic diff proof, correction-cap enforcement across calls, or authority.

All entry points provide TypeScript declarations. Existing `.mjs` contract
modules remain their runtime source of truth. The isolated TypeScript build
contains the additive configuration, CLI, and V0.3-4 supervision contracts; it
does not migrate or reinterpret the existing package runtime.

## Capability status

| Product-contract capability | V0.3-2 status |
| --- | --- |
| Mission records and governance | Supported through `/mission` |
| Hill-controlled specialist iteration | Supported through `/mission` as non-authoritative disposition eligibility; it does not dispatch seats, mutate mission state, transfer ownership, or grant tool authority |
| Mission journals and deterministic replay | Supported through `/journal` |
| Mode references | Supported through `/modes` |
| Review-workspace validation | Supported through `/workspace` |
| Hill operational-readiness classification | Supported through `/hill-readiness` as non-authoritative evidence only; it does not verify host assertions, route work, grant authority, mutate journals, or compare Hill with Fury |
| Repository configuration validation | Supported through `/config` |
| Bounded local human-evidence requirements and readiness | Supported through `/supervision` for the V0.3-4 mission-plan subject |
| One-cycle execution seam | Supported through `/runner`; authorization, execution, and result validation are injected by the caller |
| Per-call runtime-bound permission decisions | Supported through `/permission`; real environmental probes remain owned by Issue #34 |
| Permission analytics evidence | Supported through `/permission-audit`; dashboards and analytics products remain owned by Issue #13 |
| Daisy local reconnaissance tools | Supported through `/local-tools` only with a trusted authority provider; standalone CLI tool authority is intentionally unavailable |
| May revision-bound write, validation, and bounded control loop | Supported through `/local-tools` only with host-owned file and command allowlists, exact effect binding, clean-scope status observation, content-identity snapshots for observational validation, a fresh permission decision per call, loopback LM Studio capability verification, bounded tool rounds, non-authoritative control events, and untrusted final model attribution |
| Host-adapter candidate envelope | Supported through `/adapter`; GitHub translation and delivery are supported through `/github` |

Unavailable capabilities are not exported as placeholders. Their absence is a
truthful boundary, not a future commitment.

Journal v1 remains supported through `/journal`. Journal v2 is additive and is
used only by the bounded supervised-mission workflow. Journal v3 adds Wheels
Off authorization, journal v4 adds communication requests and results, and
journal v5 adds completed or uncertain execution-effect records. Journal v6
adds separately Coulson-authorized runtime-binding and atomic supersession
events. Mixed-version journals, automatic migration, waivers, a general policy
DSL and general multi-cycle orchestration remain unsupported. The bounded Daisy
broker and single-call May executor are supported only through `/local-tools`.
The May executor exposes no Git, merge, deployment, release, caller-selected
command, shell, broad network, or independent authority surface. Its local model
control loop is limited to loopback LM Studio inference plus the same
revision-bound `writeFile` and exact allowlisted `runValidation` calls.
Caller-supplied authority remains unsupported. Specialist iteration uses no
repair count or hard cap: Hill supplies a closed evidence packet and requested
disposition, while material scope, risk, authority, destructive/external,
tradeoff, and final human gates fail to Coulson.
The runner returns a validated, non-authoritative v5 or v6 effect candidate; it does
not append entries or grant the candidate authority. The trusted supervision
boundary supplies the entry ID and timestamp, rechecks exact mission, subject,
revision, and sequence identity, and appends the authoritative record. Replay
then blocks both completed and uncertain effect keys from re-execution.

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
