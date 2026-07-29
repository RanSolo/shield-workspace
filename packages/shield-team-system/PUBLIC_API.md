# Public package API

V0.3 exposes an intentional ESM package surface. Consumers may import only the
documented specifiers below; paths under `contracts/`, `adapters/`, `github/`,
and other package directories are internal even when included as data in the
package artifact.

| Specifier | Supported capability |
| --- | --- |
| `@shield/team-system` | Combined V0.3-2 contract and configuration surface |
| `@shield/team-system/mission` | Mission policy, records, validation, replay, and non-authoritative evidence-based specialist-iteration eligibility |
| `@shield/team-system/intake` | Pure `mission.intake.v1` construction of an evidence-bound, non-authoritative mission starting packet; it performs no journal write, dispatch, model/tool call, adapter effect, or external publication |
| `@shield/team-system/journal` | Journal validation, serialization, parsing, and replay |
| `@shield/team-system/modes` | Mode manifests, registries, and seat-context resolution |
| `@shield/team-system/workspace` | Review-workspace validation and deterministic PR-body generation |
| `@shield/team-system/hill-readiness` | Pure advisory `hill.readiness.v1` classification for exact seat-owned artifact revisions using closed, host-asserted evidence |
| `@shield/team-system/config` | Closed V0.3 repository configuration validation and doctor reports |
| `@shield/team-system/supervision` | Supervised journals v2-v8, including revision-bound Fury review and supersession history, publication-bound v8 communication, authoritative runtime-binding lifecycle, canonical mission briefs, Ed25519 human evidence, readiness, communication, and execution-effect replay |
| `@shield/team-system/delegation` | Closed Wheels Off v1 delegation, revocation, eligibility, and deterministic evaluation contracts |
| `@shield/team-system/adapter` | Closed host-neutral adapter v1 contracts plus publication-bound adapter v2 communication requests and result evidence |
| `@shield/team-system/runner` | Closed one-cycle runner v1 with an injected pre-executor authorization boundary, at-most-once executor dispatch, result validation, and journal-ready evidence candidates |
| `@shield/team-system/permission` | Closed runtime bindings, host attestations, deny-by-default per-call evaluation, verified authorizer, and fresh executor preflight |
| `@shield/team-system/permission-audit` | Closed digest-bound decision/result evidence, exact append receipts, and non-authoritative ledger replay |
| `@shield/team-system/review-publication` | Pure host-neutral exact-path and permitted-effect evaluation for `review.publish` and Wheels Up review publication |
| `@shield/team-system/pipeline` | Closed composable pipeline-mode taxonomy, evidence-bound repository pipeline profiles, stale-profile detection, and non-authoritative required-mode selection |
| `@shield/team-system/profile-aware-mission` | Profile-aware schema-9 briefs, frozen human-gate requirements, signed evidence, execution effects, final acceptance, and deterministic replay |
| `@shield/team-system/mission-runtime` | One profile-aware mission cycle with deterministic identities, runtime-only atomic invocation claims, journal append/readback verification, and closed waiting, blocked, uncertain, advanced, or complete outcomes |
| `@shield/team-system/local-tools` | Host-side Daisy read-only broker plus the bounded May write-and-validation tool-call executor, with injected Issue #10 authorization/audit dependencies |
| `@shield/team-system/github` | Journal-gated GitHub publication with pre-effect exact-path/effect enforcement, exact draft-PR workspace receipts, the non-authoritative `fury.plan-gate.v1` evaluator and Delivery Mode dispatch guard, attributed handoff rendering, and signed-evidence candidate translation |
| `@shield/team-system/sonarqube` | Non-authoritative exact-revision SonarQube evidence evaluation, closed finding classification, owner routing, exception attribution, and fail-closed advancement eligibility |
| `@shield/team-system/mack-validation` | Closed Mack validation reports, exact-head binding, outcome classification, and non-authoritative routing |
| `@shield/team-system/qa-mode` | QA Mode v0 handoff and Mack result evaluation contract |
| `@shield/team-system/knowledge` | Non-authoritative durable knowledge entries and validated opaque slice envelopes |
| `@shield/team-system/local-tools` | Host-side Daisy read-only broker plus the bounded May write, validation, and LM Studio control-loop executor, with injected Issue #10 authorization/audit dependencies |
| `@shield/team-system/github` | Journal-gated GitHub publication, exact draft-PR workspace receipts, non-authoritative Follow-up Mode review snapshots, the non-authoritative `fury.plan-gate.v1` evaluator and Delivery Mode dispatch guard, attributed handoff rendering, and signed-evidence candidate translation |

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
| Mission intake candidate | Supported through `/intake`; `missionIntakeV1(...)` validates host observations, configuration provenance, a canonical supervised brief, mode recommendations, artifact bindings, and runtime observations, then returns either a non-authoritative candidate or a fail-closed result |
| Hill-controlled specialist iteration | Supported through `/mission` as non-authoritative disposition eligibility; it does not dispatch seats, mutate mission state, transfer ownership, or grant tool authority |
| Mission journals and deterministic replay | Supported through `/journal` |
| Mode references | Supported through `/modes` |
| Review-workspace validation | Supported through `/workspace` |
| Hill operational-readiness classification | Supported through `/hill-readiness` as non-authoritative evidence only; it does not verify host assertions, route work, grant authority, mutate journals, or compare Hill with Fury |
| Repository configuration validation | Supported through `/config` |
| Bounded local human-evidence requirements and readiness | Supported through `/supervision`; v2-v6 retain mission-plan review requirements, while v7 binds Fitz and optional Simmons review requirements to the current repository-artifact revision after an exact-revision Fury gate |
| One-cycle execution seam | Supported through `/runner`; authorization, execution, and result validation are injected by the caller |
| Profile-aware mission-cycle composition | Supported through `/mission-runtime`; host journal, permission, execution, validation, and clock capabilities remain injected and human evidence remains external |
| Per-call runtime-bound permission decisions | Supported through `/permission`; real environmental probes remain owned by Issue #34 |
| Permission analytics evidence | Supported through `/permission-audit`; dashboards and analytics products remain owned by Issue #13 |
| Exact-scope review publication | Supported through `/review-publication`; the pure evaluator binds authority and observed proposals, while `/github` performs host observation before push, draft-PR mutation, or review-comment publication |
| Pipeline modes and repository pipeline profiles | Supported through `/pipeline`; Mack execution, live discovery, setup prompts, GitHub replies, and Mission Control UI remain unavailable |
| SonarQube validation and follow-up evidence | Supported through `/sonarqube` as host-asserted non-authoritative evidence; live scanner retrieval, credentials, dashboarding, GitHub replies, and merge authority remain outside the evaluator |
| Daisy local reconnaissance tools | Supported through `/local-tools` only with a trusted authority provider; standalone CLI tool authority is intentionally unavailable |
| May revision-bound write, validation, and bounded control loop | Supported through `/local-tools` only with host-owned file and command allowlists, exact effect binding, clean-scope status observation, content-identity snapshots for observational validation, a fresh permission decision per call, loopback LM Studio capability verification, bounded tool rounds, non-authoritative control events, and untrusted final model attribution |
| Host-adapter candidate envelope | Supported through `/adapter`; GitHub translation and delivery are supported through `/github` |
| Follow-up Mode review snapshots | Supported through `/github` as non-authoritative exact-head evidence; it does not grant routing, repair, merge, rereview, or completion authority |

Unavailable capabilities are not exported as placeholders. Their absence is a
truthful boundary, not a future commitment.

`missionIntakeV1(...)` is a package API, not an HTTP API, CLI, host adapter, or
executable mission service. It proves that framework code can participate in
mission intake. It does not initialize durable state, derive an authoritative
post-replay route, dispatch Fury or another seat, await a seat result, authorize
effects, or advance a mission cycle. Those remain responsibilities of a later
canonical host-neutral orchestration entry point.

Journal v1 remains supported through `/journal`. Journal v2 is additive and is
used only by the bounded supervised-mission workflow. Journal v3 adds Wheels
Off authorization, journal v4 adds communication requests and results, and
journal v5 adds completed or uncertain execution-effect records. Journal v6
adds separately Coulson-authorized runtime-binding and atomic supersession
events. Journal v7 preserves those semantics and adds append-only
repository-artifact revision supersession, exact-revision Fury review records,
historical/stale review projections, and deterministic routing to the Fitz
human gate. Journal v8 preserves v7 and adds Coulson-signed exact publication
authorizations. Live review publication requires a durable v8 journal, an exact
queued adapter-v2 request referencing that authorization, full replay before
effect, exact operation/target binding, and result evidence bound to the same
request and scope. Delivery Workspace returns the same journal-ready result
candidate for successful and post-scope failed publication attempts. Historical
journals remain replayable without authorizing new unscoped effects.
Mixed-version journals,
automatic migration, waivers, a general policy
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
The runner returns a validated, non-authoritative v5, v6, v7, v8, or v9 effect candidate; it does
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
