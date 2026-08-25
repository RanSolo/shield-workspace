# Issue #392 — bounded ranged reads and recoverable admission diagnostics

## Exact context

- Repository: `RanSolo/shield-workspace`
- Planning base: `90791997d05e98ddbf37cd613d6901c1564e3432`
- Subject: `github:RanSolo/shield-workspace/issue/392`
- Prior evidence only: receipt `receipt:11XT3a0TgQgw32nH2WfNwIMBoYZJjlM4`, observed on #387 HEAD `3dc4d781969a8bd2cba10f5efab2743e06e7e3d4`.
- Exact SDK evidence: `/private/tmp/shield-387-lane-rebind/.shield/runtime/copilot-fury/11XT3a0TgQgw32nH2WfNwIMBoYZJjlM4/session-state/843939e1-3039-4c0d-9803-bd779bce41c9/events.jsonl`; event 115 contains the mixed batch and event 116 contains the ranged-read `admission_argument_shape_denied` followed by sticky sibling denials.

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

The deterministic ranged contract is exact: `line_start` and `line_end` are
optional but must appear together; both are safe integers using 1-based
inclusive indexing; the maximum span is 400 lines; a start beyond the logical
line count, an end before the start, or an end beyond EOF fails closed. UTF-8
line counting treats a terminal LF as a terminator rather than an additional
empty line. Unranged `{path}` reads retain their byte-identical response. A
ranged read returns canonical JSON `{repositoryRevision,path,line_start,
line_end,content}`; `content` joins selected source lines with LF and includes
a trailing LF iff the selected final source line was LF-terminated.

The model-facing Fury request includes this exact read/search schema guidance,
including the paired range fields, bounds, and canonical ranged response.
Sticky fail-closed denial remains unchanged, but its terminal projection must
expose the closed redacted admission reason and the copy-safe recommendation
to create a fresh corrected successor, never session identity or policy drift.

## Closed terminal admission-failure contract

For new executions only, an admission denial terminalizes with code
`FURY_TOOL_ADMISSION_DENIED` and the single error
`Fury tool admission denied; create a fresh corrected successor.` The failed
executor observation and returned failed result contain `admissionFailure`
exactly `{schemaVersion:1,reason,ordinal,tool,argumentShape,recovery}`:

- `reason` is the first non-sticky `CopilotFuryAdmissionReasonV1`;
- `ordinal` is its positive callback ordinal;
- `tool` is `read`, `search`, or `unknown`;
- `argumentShape` is the existing redacted `CopilotFuryCallbackArgumentShapeV1`;
- `recovery` is the literal `fresh_corrected_successor_required`.

The field is present iff an admission denial occurred and is absent otherwise.
It contains no raw arguments, paths, queries, session IDs, or tool-call IDs.
Non-admission failures retain `COPILOT_EXECUTION_FAILED`. Existing stored
#384/#390 receipts and evidence replay byte-preserving without synthesizing the
new field; only new executions emit this contract. Add exact and conflicting
replay plus malformed-field tests.

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
