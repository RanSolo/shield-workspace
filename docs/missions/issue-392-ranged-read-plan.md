# Issue #392 — bounded ranged reads and recoverable admission diagnostics

## Exact context

- Repository: `RanSolo/shield-workspace`
- Planning base: `90791997d05e98ddbf37cd613d6901c1564e3432`
- Subject: `github:RanSolo/shield-workspace/issue/392`
- Prior evidence only: receipt `receipt:11XT3a0TgQgw32nH2WfNwIMBoYZJjlM4`, observed on #387 HEAD `3dc4d781969a8bd2cba10f5efab2743e06e7e3d4`.

## Bounded outcome

Extend the repository-owned Fury read admission contract with optional bounded
integer `line_start` and `line_end` fields. Preserve exact tracked Git-tree
path binding, immutable read-only effects, closed-schema validation, and
fail-closed behavior for unknown keys, unsafe paths, malformed/reversed/
oversized/out-of-range ranges, writes, shell, MCP, and all other excluded
capabilities. Define a copy-safe diagnostic projection that records only a
closed admission reason and non-sensitive shape/boolean/count fields, so a
single malformed ranged read cannot be misreported as session identity or
policy drift and can recommend a fresh corrected successor.

Add the production request’s machine-generated read/search shape guidance so
Fury receives the exact safe contract before tool calls. Preserve #390 exact
receipt identity, ordinary/conflicting/uncertain replay, execute-once behavior,
and never replay the failed receipt itself.

## Focused validation

Add production-faithful tests for the mixed receipt-shaped batch: compatible
`read({path})`, valid bounded ranged reads, deterministic line output, invalid
range and unknown-key rejection, redacted recoverable admission diagnostics,
model-facing shape guidance, and unchanged replay/security guarantees. Run
focused/affected Nx validation with cache enabled and exclude
`@shield/multiband`.

## Approved paths and exclusions

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

No filesystem expansion, write/edit/shell/Git/web/network/MCP effect,
authority change, receipt replay, merge, deployment, release, or final
acceptance is authorized.
