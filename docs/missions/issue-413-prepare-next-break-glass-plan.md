# Issue #413 — canonical standing break-glass dispatch rail

## Exact planning packet

- Issue: `#413`
- Repository: `RanSolo/shield-workspace`
- Planning base: `cfe0ab2cd892b155750403d9b7e89cd869af45ef`
- Authority: `none`
- Dependency: merged #411 standing-binding primitive

## Smallest bounded correction

Wire the #411 repository-owned standing break-glass binding into the
canonical `mission prepare-next` and implementation-dispatch path. The CLI
must load the existing signed standing authority and trusted registry without
signing, derive the dispatch base from the exact reviewed plan/repository/May
evidence, verify its signed `dispatchAnchorDigest`, derive the
`authorizationEvidenceDigest`, and atomically create the dispatch, digest
sidecar, and content-addressed preparation projection. It must not accept
caller-authored authority fields or fabricate journals, receipts, signatures,
or canonical authority.

Frozen inputs are the signed standing authorization,
`.shield/trusted-human-bindings.json`, the exact reviewed-plan artifact, the
stable Git HEAD/tree snapshot, and the repository-owned May seat/runtime/
executor profile. Dispatch JSON, its digest sidecar, and the preparation
projection are create-once outputs, never activation inputs. The #411 v1
contracts apply. The signed anchor covers the
canonical dispatch tuple with `authorizationEvidenceDigest` set to null;
evidence is the canonical authorization-file plus registry-file byte digest.
May identity comes only from the frozen repository-owned May profile. On
replay, pre-existing output artifacts are accepted only when byte-identical
to the deterministic derivation; any mismatch is blocked.

For the exact activation condition (authorized issue-intake mission,
implementation-ready projection, `standing_manual_break_glass.v1` profile, and
all five frozen input sources present and valid),
`prepare-next` routes to one terminal
implementation-dispatch result before legacy, #408, guided-review, or
publication branches. Absent artifacts return the closed waiting result;
malformed/stale/conflicting artifacts return closed blocked results. Only the
mission ID, repository root, and mutually exclusive `--json`/human output
mode are the only permitted CLI inputs; Fury and May identities are derived
from repository-owned inputs. No locator, authority, tuple, identity, path,
effect, or model field is caller-selectable. The terminal result cannot fall
through.

Bind the dispatch to the exact mission, plan, repository, branch, HEAD,
approved paths, effects, May identity, validation commands, exclusions, and
signed authorization evidence. Preserve all #411 exclusions: publication,
merge, deployment, release, final acceptance, credential/security expansion,
destructive effects, and material scope expansion.

Instrument the issue-observation wrapper at the repository-owned boundary to
record a closed, secret-free diagnostic with allowlisted stage enums
(`direct_observation`, `wrapper_observation`, `consistency_observation`,
`error_mapping`), call ordinal/order (`direct:1`, `wrapper:2`, `consistency:3`),
adapter/tool (`github`, `gh_cli`), executable (`repository_adapter`,
`gh_issue_view`), cwd (`approved_root`), timeout (`default`, `bounded`), and
outcome (`success`, `network_failed`, `auth_failed`, `wrapper_failed`,
`consistency_failed`, `wrapper_failure_after_direct_success`). The only admitted
transitions are `direct:1/success -> wrapper:2/success`,
`direct:1/success -> wrapper:2/wrapper_failed -> error_mapping:3/wrapper_failure_after_direct_success`,
and `direct:1/success -> wrapper:2/success -> consistency:3/success`.
Every other stage/order/outcome combination is rejected closed. Redact tokens, paths
outside the approved root, and raw errors; return a failure diagnostic only
(never persist failure).
Authenticated direct-success followed by wrapper failure remains explicitly
`wrapper_failure_after_direct_success`.
Preserve fail-closed behavior and zero effect on failure or replay.

## Approved implementation paths

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/mission-intake-v1.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Required focused coverage

- prepare-next consumes repository-owned standing authority without caller
  JSON and derives the bounded dispatch;
- prepare-next cannot invoke legacy, #408, guided-review, or publication
  handlers after the bounded terminal dispatch route;
- artifact creation is deterministic, atomic, and does not mutate journals,
  receipts, or authority;
- caller substitution, stale/conflicting authority, and tuple drift fail
  closed;
- direct authenticated observation success versus wrapper failure reports
  exact closed stage/call-order evidence without secrets;
- caller options and coordinated artifact substitution cannot change authority,
  identities, or dispatch tuple;
- replay preserves bytes and filesystem identities.
- every admitted observer sequence/outcome and every disallowed prepare-next
  option is covered deterministically.

No #408 implementation or publication is included.
