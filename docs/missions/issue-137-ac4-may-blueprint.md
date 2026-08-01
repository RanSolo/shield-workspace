# May blueprint — issue #137 AC4 correction

## Authorship and runtime evidence

- Accountable seat: May
- Reasoning runtime: hosted May (`gpt-5.3-codex-spark`, high reasoning)
- Tool executor: Codex hosted-agent runtime
- Hill action: materialized May's returned blueprint verbatim as a tracked artifact; Hill does not assume May ownership

## Mission identity and non-authority
- Implement only as an exact-action blueprint (non-authoritative).
- Mission: `mission:issue-137-ac4-correction`
- Mission revision: `sha256:PoxkVrolxT0o4zBXXlSjehOjxQHjba1SWQrzlRVXMiE`
- Hill plan commit: `6e5c3a3c1f8e09087beb90ec09979156c5ba9cff`
- Hill plan sha256: `30e719b5e8b907b7f1448d0e6fbeea743a173f765ad37b2bfe3def8aef8704c9`
- Scope-freeze base: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Exact Fury precondition before edits: `FURY_APPROVE` on the future plan commit/digest, PR #168 readback at the same head, and literal `dispatch_ready` from existing Delivery Workspace guard with current permission/executor/runtime binding.
- Prohibited now: external run, `#29`, merge, deploy, release, scope expansion, and any human simulation.

## Exact change set (must be exactly these 6 paths)
1. `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`
2. `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
3. `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
4. `docs/missions/issue-137-ac4-correction-mission-brief.json`
5. `docs/missions/issue-137-ac4-correction-plan.md`
6. `docs/missions/issue-137-ac4-may-blueprint.md`

## Implementation sequence (in order)
1. Source update: `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`
- Replace definition field `measurementClass` with `defaultMeasurementClass` for all definitions, preserving existing values.
- Add immutable closed class set: `{"measured","derived","estimated","not-observable"}`.
- Keep pending entries emitted with `measurementClass: null`.
- In recorded-entry validation:
  - Accept `measurementClass` only from the closed set.
  - Reject malformed/unknown/accessor-backed/inherited/null values as malformed with existing `evidence_measurement_class_malformed:<evidenceId>` precedence.
- Preserve existing authority and provenance semantics; keep `authority` immutable and independent from class.
- Preserve existing `requiresAttribution: true` behavior for those definitions.
- Add operator-recorded override rule:
  - If `definition.authority === "operator-recorded"` and `entry.measurementClass === "measured"`, require existing dispatch-receipt attribution path and matching replay exactly as today's attribution model does.
  - No fallback to caller-only claimed measurement.
- Keep non-operator measured/derived/estimated authority-only classes valid as metadata only; do not grant readiness.
- Use identical effective-attribution predicate in `closeEvidenceEntry(...)` and `gradeEvidenceInventory(...)`.

2. Test update: `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- Keep `human-only` and existing human-kernel-stop behavior unchanged.
- Update tests to prove:
  - all pending entries remain `measurementClass: null`;
  - closed recorded class acceptance includes `estimated` (and continues to include `measured`, `derived`, `not-observable`) and rejects unknown malformed classes;
  - caller-only `operator-recorded` entry defaults remain not-observable and `measured` is rejected without exact receipt/replay attribution;
  - independently attributed `operator-recorded` entries can be `measured`;
  - hostile attribution matrix for `operator-recorded measured`: missing attribution input, malformed receipt, stale mission/repository revision, wrong workspace, wrong parent/child session pair, wrong seat, non-terminal lifecycle, and receipt reuse.
  - existing human evidence gates still produce `human_evidence_requires_kernel_validation:<evidenceId>` when recorded and unchanged reasons/seat checks remain intact.
- Add executable identity baseline test with the exact name:
  - `corrected fixture identity baseline verifies the frozen artifact set`
  - assert `verifyFixtureIdentity(...)` returns `state: "valid"`.

3. Identity record update: `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- Update only `coveredArtifacts.evidence-inventory.digest` to the framed digest for the updated `evidence-inventory.mjs`.
- Keep all other fields/ordering stable unless digest recalculation forces minimal structural changes.

4. Baseline record digest update in fixture test
- Update `FIXTURE_RELEASE_BASELINE.identityRecordDigest` in `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs` to match the new `fixture-identity-v1.json` identity-file digest.

5. Validation
- Run focused executable identity test (after step 4).
- Run full benchmark suite after all source/test/identity changes.

## Required validation commands (from Hill plan)
1. `node --test --test-name-pattern='corrected fixture identity baseline verifies the frozen artifact set' benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
2. `npm --prefix benchmarks/v0.3-external-acceptance-v1 test`
3. `git diff --check`

## Stop conditions
- If current permission binding, plan digest, branch/PR head, or guard output is anything other than literal `dispatch_ready`, implementation halts and returns to Hill/Fury with blocker evidence.
- No scope beyond these six paths.
