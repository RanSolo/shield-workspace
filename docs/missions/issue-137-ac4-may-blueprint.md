# May blueprint — issue #137 AC4 correction

## Authorship and runtime evidence

- Accountable seat: May
- Reasoning runtime: hosted May (`gpt-5.3-codex-spark`, high reasoning)
- Tool executor: Codex hosted-agent runtime
- Hill action: materialized May's successor blueprint as a tracked artifact; Hill does not assume May ownership

## Fury status and governing defect
- Latest Fury state: `FURY_REVISE` on exact planning head `6b21b0565173d568e3268c261fbffabcfd354b89`.
- Binding update: plan must be treated as frozen at commit `6b21b0565173d568e3268c261fbffabcfd354b89` with Hill plan SHA-256 `088edd34eb1e6e6bef2af1888e11f4e0fcd52943d48f8d0cbc9ee2c95b142eb5`.
- This blueprint is non-authoritative and remains implementation planning; no edits executed in this response.

## Mission identity
- Mission: `mission:issue-137-ac4-correction`
- Mission revision: `sha256:PoxkVrolxT0o4zBXXlSjehOjxQHjba1SWQrzlRVXMiE`
- Scope-freeze base: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Branch: `agent/issue-137-ac4-correction`
- Draft PR: `#168`

## Immutable planning artifacts (must not be mutated during May implementation)
- `docs/missions/issue-137-ac4-correction-plan.md`
- `docs/missions/issue-137-ac4-correction-mission-brief.json`
- `docs/missions/issue-137-ac4-correction-may-blueprint.md`

## Allowed writable implementation paths (exactly three)
1. `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`
2. `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
3. `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`

## Exact complete delta from scope-freeze base (exactly six paths total)
- The above three implementation paths, plus the three planning artifacts above.

## Core implementation requirements (preserved)
1. Measurement-class correction
- Replace each definition field `measurementClass` with `defaultMeasurementClass` preserving current values.
- Pending entries continue to emit `measurementClass: null`.
- Recorded entries validate only:
  - `measured`
  - `derived`
  - `estimated`
  - `not-observable`
- Preserve all malformed/null/unknown/accessor-backed/inherited failures as `evidence_measurement_class_malformed:<evidenceId>` with existing precedence.

2. Closed authority / readiness invariants
- Do not derive readiness or authority from `measurementClass`.
- Keep `authority` immutable and independent.
- Keep dependency reasons, waiting/missing state model, and human-kernel stops unchanged.
- Preserve fixture identity framing, covered artifact order, lifecycle, and non-measurement semantics unless required by this correction.

3. Attribution behavior
- For definitions with `requiresAttribution: true`, keep existing exact dispatch receipt/replay requirements.
- Add strict operator-recorded guard:
  - `operator-recorded` + `measured` requires existing exact attribution path and matching replay input; fail closed without it.
  - No fallback semantics.
- Human-only entries keep existing verified-human evidence requirement and cannot be satisfied via dispatch attribution.

4. Test changes
- Extend `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs` to prove:
  - all pending entries remain `measurementClass: null`;
  - recorded entries accept the full four-class matrix and reject malformed/unknown classes;
  - caller-only `operator-recorded` cannot claim `measured` without exact attribution;
  - independently attributed operator evidence can be `measured`;
  - hostile attribution matrix for operator-recorded measured path remains closed for missing input, malformed receipt, stale mission/repository revision, wrong workspace, wrong parent/child session, wrong seat, non-terminal lifecycle, and receipt reuse;
  - human-only behavior remains a kernel-validation stop with existing seat and reference checks.
- Add executable identity baseline test asserting literal `state === "valid"` for corrected fixture identity preflight.

5. Fixture identity constraint (corrected defect)
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json` may change **only**:
  - `coveredArtifacts.evidence-inventory.digest`
- No other structural or semantic field changes are permitted.
- Update any corresponding identity baseline digest in test fixture code to match the resulting immutable identity file digest.

## Validation requirements (unchanged)
1. `node --test --test-name-pattern='corrected fixture identity baseline verifies the frozen artifact set' benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
2. `npm --prefix benchmarks/v0.3-external-acceptance-v1 test`
3. `git diff --check`

## Execution guardrails (unchanged)
- No external run, no `#29`, no merge, deploy, or release effect, no expanded paths, no human evidence simulation.
- No implementation until an exact plan gate and local dispatch eligibility are both current and literal `dispatch_ready` with complete binding checks.
