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
| `@shield/team-system/supervision` | Journal v2, canonical mission briefs, Ed25519 human evidence, readiness, and no-effect supervised-step contracts |
| `@shield/team-system/delegation` | Closed Wheels Off v1 delegation, revocation, eligibility, and deterministic evaluation contracts |

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
| General permission decisions | Unavailable; only documented mission-policy decisions exist |
| Host-adapter candidate envelope | Unavailable; no host-neutral runtime contract exists yet |

Unavailable capabilities are not exported as placeholders. Their absence is a
truthful boundary, not a future commitment.

Journal v1 remains supported through `/journal`. Journal v2 is additive and is
used only by the bounded supervised-mission workflow. Mixed-version journals,
automatic migration, waivers, supersession, general effects, runners, permission
brokers, and host communication remain unsupported.

Delegated missions use journal schema v3 while schema-v2 supervised journals
remain supported without reinterpretation. Wheels Off exposes standing
pre-authorization only; it does not expose a runner, policy DSL, host inspection,
or merge/deploy/release authority.

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
