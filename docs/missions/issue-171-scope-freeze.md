# Issue #171 scope freeze

## Identity and status

- Mission: `mission:issue-171`
- Mission revision: `sha256:5ud527SOimvIoD4fXhxEoWBHxtuTm5mkppa6WT8g91s`
- Subject: `github:RanSolo/shield-workspace/issue/171`
- Base revision: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Branch: `agent/issue-171-execution-evidence`
- Accountable scope owner: Hill
- Status: approved for planning; Slice A is being prepared for exact Fury review; implementation authority has not been granted

## Objective

Provide the production evidence adapters required for one future governed local-May dispatch: durable permission-audit storage, durable May control-event storage, and a supported current schema-9 execution-scope plus active May runtime-binding source.

## Frozen boundaries

1. Existing permission, audit-record, mission-runtime, May control-loop, and human-authority contracts remain authoritative.
2. Schema-v2 governance cannot be synthesized, migrated in place, or reinterpreted as v6-v9 execution authority.
3. Caller prose, packets, model output, CLI flags, or Hill memory cannot create runtime binding, executor identity, writable scope, validation commands, or permission authority.
4. May control events remain non-authoritative telemetry and cannot grant or upgrade authority.
5. Missing, stale, malformed, conflicting, duplicated, out-of-scope, append-uncertain, or readback-mismatched evidence fails closed before a tool effect where possible.
6. No local-model invocation, governed May dispatch, #170 composition, #137 external fixture run, #29, GitHub publication, merge, deployment, or release is included.
7. Work should be divided into independently reviewable implementation slices. A slice cannot claim the full issue complete until all acceptance criteria are exact-bound and validated.

## Planning packets

May must challenge and refine three packets:

1. Filesystem permission-audit store and replay/readback semantics.
2. Durable May control-event store and replay/readback semantics.
3. Supported schema-9 execution-context and active May runtime-binding source plus host composition.

Fury resolved the third packet as blocked. #171 cannot create a separate authoritative runtime-binding store or derive binding authority from downstream receipts. Canonical schema-9 binding/supersession and a positive typed Wheels Up authority producer are separately reviewed prerequisites. Fury may further split the remaining packets, but may not absorb those prerequisites, #172, #173, or #170.

## Current delivery packet

Only Slice A, the filesystem permission-audit store, advances to an exact implementation blueprint and plan gate. Slice B remains planned but unimplemented until its own exact blueprint and review. Slice C remains blocked on the authority prerequisites above.

## Required gates

1. May produces an exact, non-authoritative blueprint with path sets and build-first validation per slice.
2. Fury reviews the exact committed plan and resolves the runtime-binding provenance question.
3. Implementation waits for explicit Wheels Up and follows only the Fury-approved slice.
4. Mack validates each exact implementation revision as a validation attachment outside the V0.3 Mission Brief participant registry. Mack cannot provide human authority evidence.
5. Fury conformance review precedes Fitz human review.
