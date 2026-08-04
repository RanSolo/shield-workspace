# Issue #191 — exact-authority governed May plan

## Review identity

- Mission: `mission:issue-191`
- Mission revision: `sha256:6P9A7Cbzl3KNRBT841SRMp4S91kL4n4g6EeFhnUhtt0`
- Subject: `github:RanSolo/shield-workspace/issue/191`
- Scope base: `b1abf9fb86c117cc835849e92e809390c32f1e67`
- Branch: `agent/issue-191`
- Accountable plan owner: Hill
- Intended implementation seat after approval: May
- Status: planning only; no implementation, #137 external run, or #29 work has started

## Local specialist evidence

Bionic-hosted Gemma 4 31B received two small planning packets. Daisy used 1,182 input tokens and 863 reasoning tokens; May used 1,285 input tokens and 1,021 reasoning tokens. Both preserved the four reported defects. Hill rejected May's invented placeholder paths and tightened its vague effect-key proposal to the exact repository contracts below.

## Objective

Make `runGovernedMayDispatchStepV1` capable of executing one exact preauthorized write followed by one exact preauthorized validation under a schema-9 binding that retains its complete signed capability scope. Preserve fail-closed authority, durable evidence, and recovery behavior.

## Frozen boundaries

- No change to human authority, mission profiles, schema-9 journal records, runtime-binding scope, or final acceptance.
- `loadSchema9PermissionContextV1` continues to return and validate the complete signed binding capability set.
- No external fixture execution, #137 proving effect, #29 work, GitHub effect, merge, deployment, release, migration, or destructive operation.
- No generic autonomous loop, scheduler, retries, wildcard effects, capability widening, or caller-asserted success.
- Existing Daisy and generic local-tool behavior remains unchanged.

## Proposed design for Fury review

### 1. One canonical May tool-effect contract

Add `packages/shield-team-system/src/may-tool-effect-v1.mts` as the pure shared contract for:

- the two existing tool mappings:
  - `writeFile` → `repository.write_file` / `behavioral_implementation` / `filesystem_write`;
  - `runValidation` → `repository.run_validation` / `verification` / `process_execute`;
- closed planned-operation descriptors:
  - write: exact path, exact UTF-8 content, and exact current SHA-256 or `absent`;
  - validation: exact command ID, canonical executable path, argument vector, timeout, and host-observed executable identity;
- deterministic derivation of the existing `effect:may:sha256:*` key without changing its bytes or semantics;
- strict validation and immutable copies of an exact two-operation sequence: one write followed by one validation.

The module is pure: filesystem observation remains with the trusted host and executor. Re-export the helper and types through `@shield/team-system/local-tools`. Update `may-tool-executor.mjs` to consume the shared mappings and effect-key derivation, retaining compatible exports for existing callers.

### 2. Pre-invocation planned-operation binding

Extend `RunGovernedMayDispatchStepTrustedDependenciesV1` with one required own data field containing the exact ordered planned-operation descriptors. This is host-supplied evidence, not authority by itself.

Before Helicarrier compilation, packet claim, model invocation, or repository effects, `runGovernedMayDispatchStepV1` must:

1. validate the closed two-operation sequence;
2. derive both exact May effect keys;
3. derive the existing canonical mission-cycle effect key;
4. require the signed active authority effect-key set to equal exactly those three keys;
5. require signed action IDs, effect classes, capabilities, writable path, and validation command ID to equal the descriptor projections;
6. require the trusted validation-command registry to exact-match the planned command ID, executable, args, and timeout;
7. include the immutable planned operations and their keys in the canonical dispatch envelope compiled by Helicarrier.

The validation executable identity is independently re-observed by the existing May executor. Any path, bytes, precondition, command, argument, timeout, executable identity, set, order, or authority mismatch fails before model invocation. Runtime identity drift remains governed by the existing binding and model probe.

### 3. Per-call capability narrowing after full-context validation

Keep `loadSchema9PermissionContextV1` unchanged. In `governed-may-dispatch-v1.mts`, first run the existing `bindPermissionContextV1` exact check against the complete signed active binding and full capability set. Then derive a fresh immutable per-call context from the active `RunnerCyclePlan`:

- `repository.write_file` requires exactly `filesystem_write`;
- `repository.run_validation` requires exactly `process_execute`;
- unknown or mismatched action/effect mappings fail closed;
- the active binding embedded in the context remains byte-for-byte unchanged and retains the full signed scope;
- narrowing cannot add or substitute actions, effects, keys, paths, commands, or capabilities.

Return only the narrowed copy to the per-tool authorizer and executor. The outer mission-cycle permission context remains full-scope.

### 4. Validation exit and signal semantics

In `may-tool-executor.mjs`, preserve the current bounded process launch, timeout, output cap, and post-command workspace verification. After workspace verification:

- exit code `0` with no signal returns `validation_completed`;
- a nonzero exit with no signal throws a bounded failed result and releases no command output as successful evidence;
- a terminating signal produces an uncertain executor outcome;
- timeout, output truncation, launch ambiguity, or workspace drift retains current uncertain behavior.

No failed or uncertain validation can increment the successful validation count or produce a completed tool audit result.

### 5. Exactly one write, then exactly one validation

Do not change the generic `runMayControlLoop` completion contract. In the governed dispatcher, after `runMayControlLoop` returns but before the outer `runMissionCycle` executor reports `completed`:

- require `completedToolCalls === 2`, `writeCalls === 1`, and `validationCalls === 1`;
- read the durable May control-event store;
- require exactly one `may_control_writeFile_completed` event followed by exactly one `may_control_runValidation_completed` event, bracketed by one start and one completed terminal event for the exact child session;
- require the successful per-call audit records to bind the two planned effect keys, actions, effects, singleton capabilities, decision identities, and order;
- otherwise return a failed or uncertain executor result according to existing post-effect uncertainty rules, and do not append the authoritative mission effect.

The existing final journal, audit, control-store, and dispatch-receipt readbacks remain required and gain assertions for the exact planned-operation evidence.

## Exact implementation paths

- `packages/shield-team-system/src/may-tool-effect-v1.mts` (new)
- `packages/shield-team-system/src/governed-may-dispatch-v1.mts`
- `packages/shield-team-system/scripts/model/may-tool-executor.mjs`
- `packages/shield-team-system/public/local-tools.mjs`
- `packages/shield-team-system/public/local-tools.d.mts`
- `packages/shield-team-system/tests/may-tool-effect-v1.test.mjs` (new)
- `packages/shield-team-system/tests/may-tool-executor.test.mjs`
- `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs` only if the new public helper requires additive export coverage

No other production, fixture, CLI, authority, journal, or documentation path is in implementation scope. This plan file remains immutable during May implementation.

## Required tests

- Pure effect contract: exact legacy-compatible write and validation keys; malformed, inherited, accessor-backed, duplicate, missing, extra, and reordered descriptors fail closed.
- Capability narrowing: full binding remains unchanged; write receives only `filesystem_write`; validation receives only `process_execute`; substitution and unknown actions fail.
- Validation: zero succeeds; nonzero fails; signal is uncertain; timeout, truncation, launch failure, and workspace drift preserve existing semantics.
- Governed sequence: write then validation succeeds; validation-only, write-only, validation-before-write, duplicate write, duplicate validation, incorrect counts, incorrect control-event order, and mismatched audit identities do not advance.
- Preflight: changed output byte, path, precondition, executable, executable identity, argv, timeout, command ID, key set, key order, action, effect, capability, or registry entry fails before model invocation and packet claim.
- Durable restart/replay and existing schema-9, permission, May executor, dispatch, package-surface, and full package tests remain green.

## Validation commands

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/may-tool-effect-v1.test.mjs packages/shield-team-system/tests/may-tool-executor.test.mjs packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

## Stop and review sequence

1. Commit this plan without implementation changes.
2. Fury reviews the exact plan revision.
3. On `FURY_REVISE`, Hill corrects only the plan and returns the new exact revision to the same Fury seat.
4. After `FURY_PASS`, obtain signed Wheels Up for the exact implementation scope before May edits production files.
5. Bionic/Gemma May implements only the approved paths and stops at an exact revision.
6. Mack validates that exact revision; Fury performs exact-revision conformance review.
7. Open one bounded draft PR for human review. Do not merge or resume #137 in this mission.
