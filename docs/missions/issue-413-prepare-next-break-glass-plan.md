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
must load the existing signed standing authority and trusted registry,
derive closed authorization and dispatch artifacts internally, and persist
only content-addressed preparation artifacts with atomic create-once
semantics. It must not accept caller-authored authority fields or fabricate
journals, receipts, signatures, or canonical authority.

Bind the dispatch to the exact mission, plan, repository, branch, HEAD,
approved paths, effects, May identity, validation commands, exclusions, and
signed authorization evidence. Preserve all #411 exclusions: publication,
merge, deployment, release, final acceptance, credential/security expansion,
destructive effects, and material scope expansion.

Instrument the issue-observation wrapper at the repository-owned boundary to
record a closed, secret-free call-stage/order/environment/tool binding and
map authenticated direct-success/wrapper-failure to a truthful deterministic
classification. Preserve fail-closed behavior and zero effect on failure or
replay.

## Approved implementation paths

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/mission-intake-v1.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Required focused coverage

- prepare-next consumes repository-owned standing authority without caller
  JSON and derives the bounded dispatch;
- artifact creation is deterministic, atomic, and does not mutate journals,
  receipts, or authority;
- caller substitution, stale/conflicting authority, and tuple drift fail
  closed;
- direct authenticated observation success versus wrapper failure reports
  exact closed stage/call-order evidence without secrets;
- replay preserves bytes and filesystem identities.

No #408 implementation or publication is included.
