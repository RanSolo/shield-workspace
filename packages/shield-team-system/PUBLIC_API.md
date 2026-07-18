# Public package API

V0.3 exposes an intentional ESM package surface. Consumers may import only the
documented specifiers below; paths under `contracts/`, `adapters/`, `github/`,
and other package directories are internal even when included as data in the
package artifact.

| Specifier | Supported capability |
| --- | --- |
| `@shield/team-system` | Combined public contract surface |
| `@shield/team-system/mission` | Mission policy, records, validation, and replay |
| `@shield/team-system/journal` | Journal validation, serialization, parsing, and replay |
| `@shield/team-system/modes` | Mode manifests, registries, and seat-context resolution |
| `@shield/team-system/workspace` | Review-workspace validation and deterministic PR-body generation |

All entry points provide TypeScript declarations. The existing `.mjs` contract
modules remain the runtime source of truth; V0.3-2 does not introduce a package
compilation step or migrate those modules.

## Capability status

| Product-contract capability | V0.3-2 status |
| --- | --- |
| Mission records and governance | Supported through `/mission` |
| Mission journals and deterministic replay | Supported through `/journal` |
| Mode references | Supported through `/modes` |
| Review-workspace validation | Supported through `/workspace` |
| Repository configuration validation | Unavailable; no runtime contract exists yet |
| General human-evidence requirements and readiness | Unavailable; specification exists but runtime is deferred |
| General permission decisions | Unavailable; only documented mission-policy decisions exist |
| Host-adapter candidate envelope | Unavailable; no host-neutral runtime contract exists yet |

Unavailable capabilities are not exported as placeholders. Their absence is a
truthful boundary, not a future commitment.

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
