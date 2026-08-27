# Dispatcher allowance recovery — bounded successor to #416

## Planning identity

- Repository: `RanSolo/shield-workspace`
- Current base: `fe1785fbb5c74732186403d819ab43eb8d195b3c`
- Related repair: [Issue #416](https://github.com/RanSolo/shield-workspace/issues/416)
- Authority: `none`
- Owner: Hill planning; one future writer only

## Observed blocker

The #416 terminal replay requirement cannot read the immutable W8 predecessor because the current dispatcher rejects its closed `allowedTools:["read"]` request before historical evidence is read. The rejection is at `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts:1629`. The required allowance exists only on the separate `agent/issue-406-fury-read-path` revision and is not part of #416.

Immutable predecessor facts, preserved without rewrite or replay:

- request bytes: `sha256:1iQWgPCQshwNFIgSypbbJxe1bD8fWx2KwpiUwUVMqtM`
- evidence content: `sha256:fhZYUlmN2vr48BQFfNK_CHlDiVX7FzTS8kU6KABQg_8`
- receipt: `receipt:W8EY-iQrzqU-XXQjFWE3srDeqG_X2P4o`
- terminal receipt digest: `sha256:23lYRNxPfetl2ZNIeAIH1Vqw_f6iZ5HUw2cx-jQYYJQ`
- unchanged denial: `FURY_TOOL_ADMISSION_DENIED`, reason `admission_argument_shape_denied`, ordinal `35`

The predecessor dispatch identifies #386 at its historical revision and must remain distinct from #406’s non-authorizing regression facts. No identity relabeling is permitted.

## Smallest repair

Change only the repository-owned dispatcher admission needed to accept this already-closed repository-relative read request through the existing safe read policy. Preserve strict closed JSON, path/no-follow boundaries, search policy, claim identity, append integrity, single-consumer replay, and cross-repository isolation. The repair must permit the exact W8 read-shaped continuation without granting general tool policy or changing unrelated admission categories.

Add focused production-shaped tests that prove the exact request reaches historical evidence replay, returns the unchanged denial, preserves the predecessor receipt and evidence bytes, and performs no new claim, append, execution, or receipt emission. Reject absolute, unsafe, malformed, extra-field, conflicting, and cross-repository requests.

## Exact implementation scope

The future writer may change only:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

The plan artifact itself is the only current change. This plan does not authorize implementation.

## Explicit exclusions

No changes to #416 implementation files, #386 or #406 evidence, receipts, journals, plans, or branches; no evidence rewrite, receipt replay, authority creation, new tool policy, broad search-policy change, new rail activation, GitHub mutation, publication, merge, deployment, release, or final acceptance. No human gate is requested by this authority-none plan.

## Validation and review

One future writer must bind the exact plan revision and the immutable predecessor tuple above. Required evidence is focused Node 22 testing, normal-cache Nx validation, `git diff --check`, clean exact scope, fresh Mack validation, and independent Fury conformance. Any successor must be append-only, single-consumer, replay-safe, and exact-revision bound.
