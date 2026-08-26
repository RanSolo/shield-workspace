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

For the exact activation condition (authorized issue-intake mission,
implementation-ready projection, standing break-glass profile, and explicit
repository-owned artifact set), `prepare-next` routes to one terminal
implementation-dispatch result before legacy, #408, guided-review, or
publication branches. Absent artifacts return the closed waiting result;
malformed/stale/conflicting artifacts return closed blocked results. Only the
locator and non-authoritative output mode are permitted CLI inputs; options
cannot affect authority, tuple, identities, or artifacts. The terminal result
cannot fall through to another route.

Bind the dispatch to the exact mission, plan, repository, branch, HEAD,
approved paths, effects, May identity, validation commands, exclusions, and
signed authorization evidence. Preserve all #411 exclusions: publication,
merge, deployment, release, final acceptance, credential/security expansion,
destructive effects, and material scope expansion.

Instrument the issue-observation wrapper at the repository-owned boundary to
record a closed, secret-free diagnostic with allowlisted stage enums
(`direct_observation`, `wrapper_observation`, `consistency_observation`,
`error_mapping`), call ordinal/order, adapter/tool identity, executable
binding, cwd class, timeout class, and outcome enum. Redact tokens, paths
outside the approved root, and raw errors; return or persist it only as a
content-addressed create-once artifact. Authenticated direct-success followed
by wrapper failure remains explicitly `wrapper_failure_after_direct_success`.
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

No #408 implementation or publication is included.
