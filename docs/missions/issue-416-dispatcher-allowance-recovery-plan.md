# Dispatcher allowance recovery — bounded successor to #416

## Planning identity

- Repository: `RanSolo/shield-workspace`
- Mission: `mission:issue-intake:cZePw1cHKbJMdb0yI-K4XxpP0xNU0RwNnTRxBVqIrzQ`
- Successor branch: `agent/issue-416-recovery-successor`
- Successor HEAD: `6506edf72acd9c19c959744d5e7ea69e97c94771`
- Issue URL: `https://github.com/RanSolo/shield-workspace/issues/416`
- Issue revision: `sha256:KE89aNbkhxnh3flruAMge8jgbD2D-LSygQy8VS3UGPY`
- Acceptance-criteria digest: `sha256:f793f0ac6217b1f039fee9e1202fdebf9ef60c5bafcd84a81d86e0a77152dfc4`
- Planning source: `6506edf72acd9c19c959744d5e7ea69e97c94771:docs/missions/issue-416-dispatcher-allowance-recovery-plan.md`
- Related repair: [Issue #416](https://github.com/RanSolo/shield-workspace/issues/416)
- Authority: `none`
- Owner: Hill planning; one future writer only

The four previously reviewed compatibility corrections remain required and
must be regression-validated on the successor: signed and verified
`transitionPlanId`/`transitionPlanDigest`; authenticated content-addressed
Issue-406 source identity; bounded parse/replay failure handling; and terminal
revalidation of canonical root, revision, tree, origin, clean status, and
authenticated snapshots. Any changed path outside the two-file implementation
allowlist is a fail-closed plan mismatch.

## Observed blocker

The #416 terminal replay requirement cannot read the immutable W8 predecessor because the current dispatcher rejects its closed `allowedTools:["read"]` request before historical evidence is read. The rejection is at `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts:1629`. The required allowance exists only on the separate `agent/issue-406-fury-read-path` revision and is not part of #416.

Immutable predecessor facts, preserved without rewrite or replay:

- request bytes: `sha256:1iQWgPCQshwNFIgSypbbJxe1bD8fWx2KwpiUwUVMqtM`
- evidence content: `sha256:fhZYUlmN2vr48BQFfNK_CHlDiVX7FzTS8kU6KABQg_8`
- receipt: `receipt:W8EY-iQrzqU-XXQjFWE3srDeqG_X2P4o`
- terminal receipt digest: `sha256:23lYRNxPfetl2ZNIeAIH1Vqw_f6iZ5HUw2cx-jQYYJQ`
- unchanged denial: `FURY_TOOL_ADMISSION_DENIED`, reason `admission_argument_shape_denied`, ordinal `35`

The predecessor dispatch identifies #386 at its historical revision and must remain distinct from #406’s non-authorizing regression facts. No identity relabeling is permitted. The `[read]` exception must authenticate the complete W8 ledger/evidence/packet binding before returning the existing denial with `replayed:true`; malformed or mismatched input returns without claim, append, execution, re-emission, or receipt emission.

## Smallest repair

Change only the repository-owned corrected-successor capability gate needed to accept the exact already-closed W8 `[read]` tuple: request digest, evidence digest, receipt, terminal digest, denial code/reason/ordinal, and durable repository/workspace/mission/subject/revision identities. Every mismatch must fail closed; all other `[read]` requests and existing `[read,search]` behavior remain unchanged. Preserve strict closed JSON, path/no-follow boundaries, search policy, claim identity, append integrity, single-consumer replay, and cross-repository isolation.

The terminal result is the existing W8 failed result with `replayed:true`, returned before claim, successor construction, execution, re-emission, ledger append, or receipt emission. This recovery creates no successor and does not replay or rewrite a receipt. Do not change read/search descriptors, argument validation, path policy, ranged-read EOF behavior, prompts, or general tool admission; the defect is only the corrected-successor capability gate.

Add a hermetic focused test fixture in the existing test file that proves the exact request reaches historical evidence replay, returns the unchanged denial with `replayed:true`, preserves byte-for-byte identical ledger and evidence snapshots, and performs no claim, append, execution, re-emission, or receipt emission. Mutate every immutable binding (including stale/conflicting/cross-repository identities) and reject each mutation. Reject absolute, unsafe, malformed, and extra-field requests. The fixture must not depend on `/private/tmp` or #386/#406 branches.

## Exact implementation scope

The future writer may change only:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

The plan artifact itself is the only current change. This plan does not authorize implementation.

## Explicit exclusions

No changes to #416 implementation files, #386 or #406 evidence, receipts, journals, plans, or branches; no evidence rewrite, receipt replay, receipt re-emission, ledger append, authority creation, new tool policy, broad search-policy change, read/search descriptor changes, argument/path/EOF changes, prompts, new rail activation, GitHub mutation, publication, merge, deployment, release, or final acceptance. No human gate is requested by this authority-none plan.

## Validation and review

One future writer must bind the exact plan revision and the immutable predecessor tuple above. Required evidence is focused Node 22 testing, normal-cache Nx validation, `git diff --check`, clean exact scope, fresh Mack validation, and independent Fury conformance. Any successor must be append-only, single-consumer, replay-safe, and exact-revision bound.
