# Mission #137 AC4 correction — complete Fury plan

## Review identity

- Mission: `mission:issue-137-ac4-correction`
- Mission revision: `sha256:PoxkVrolxT0o4zBXXlSjehOjxQHjba1SWQrzlRVXMiE`
- Subject: `github:RanSolo/shield-workspace/issue/137`
- Scope-freeze base: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Accountable plan owner: Hill
- Intended implementation owner after approval: May
- Status: proposed for exact-revision Fury review; no implementation is authorized by this artifact

## Objective

Correct #137 acceptance criterion 4 so recorded agent and verified-human evidence can preserve the closed measurement classes `measured`, `derived`, `estimated`, and `not-observable`, while pending evidence keeps `measurementClass: null` and existing authority, provenance, attribution, waiting, and readiness behavior remains unchanged.

This plan also supplies the missing #137 acceptance-criterion 6 evidence: Fury must review this complete corrective plan at its exact committed revision before May changes fixture implementation files.

## Frozen boundaries

- No fresh-external-repository run and no #29 work.
- No Mack validation until a corrected exact implementation revision exists.
- No merge, deployment, release, production, destructive, or generalized orchestration effect.
- No fabricated Coulson, Fitz, Simmons, or other human evidence.
- Measurement classification remains metadata and cannot grant authority or readiness.
- Preserve the current 20 evidence identifiers, their order, requirement states, authority values, and pending `missing`/`waiting` states.
- Preserve dispatch-receipt and replay-anchor validation; do not create a second attribution taxonomy.
- Preserve unrelated #137 fixture isolation, lifecycle, package identity, and external-run behavior.

## Specialist-dispatch authority binding

Fury plan approval is necessary but not sufficient for May dispatch. Before implementation, Hill must obtain a literal `dispatch_ready` result from the existing Delivery Workspace guard for the current draft PR and must independently validate specialist-dispatch eligibility. The evidence supplied to those checks must bind:

- the signed mission approval at revision `sha256:PoxkVrolxT0o4zBXXlSjehOjxQHjba1SWQrzlRVXMiE`;
- repository `RanSolo/shield-workspace`, the canonical writable worktree, base branch `main`, and mission branch `agent/issue-137-ac4-correction`;
- the new full plan commit and digest after all Fury corrections, not superseded commit `04d73d92da20e5d66cd3e3e08d06fd85ef9c826c`;
- draft PR #168 and a verified readback whose head equals that plan commit;
- blueprint artifact `docs/missions/issue-137-ac4-correction-plan.md`, accountable implementation seat `may`, and Fury `PASS` at the exact plan commit;
- the exact May delta listed below, validation obligations, local/hosted runtime identity, and actual tool executor identity; and
- prohibited external run, #29, merge, deployment, release, destructive, and expanded-scope effects.

When governed local-May tooling is selected, its permission binding and fresh decision must additionally exact-match the mission revision, plan-head artifact revision, canonical worktree, branch, seat `may`, runtime, executor, and the three approved implementation paths. Missing, stale, malformed, substituted, or mismatched guard, review, permission, scope, runtime, executor, repository, branch, PR, or revision evidence stops implementation. The operator's sequencing approval in chat is not substituted for these executable checks.

## Observed defect at the scope-freeze base

- `createPendingEntry(...)` correctly emits `measurementClass: null`.
- `closeEvidenceEntry(...)` accepts a recorded entry only when `entry.measurementClass === definition.measurementClass`.
- Definitions currently use `measured`, `derived`, or `not-observable`; no recorded entry can use `estimated`.
- The focused test named `evidence inventory validates all configured measurement classes for recorded entries` currently requires `estimated` to fail.
- The prior #138 plan required a closed recorded-entry union containing all four classes and a four-class matrix, including measured operator evidence only when independently observed.
- Local Daisy accurately identified the strict equality and missing `estimated` value, but its conclusion that an absent class is nevertheless representable was rejected by Hill.

## Approved implementation shape proposed to Fury

### 1. Separate definition defaults from the recorded-entry class

- Replace each internal definition's `measurementClass` field with `defaultMeasurementClass` without changing the current default value for any evidence identifier.
- Add one closed immutable set containing exactly `measured`, `derived`, `estimated`, and `not-observable`.
- Pending entries continue to carry literal `measurementClass: null`; no default is projected into pending evidence.
- Recorded agent and recorded human evidence accept only a string in the closed four-class set. Unknown, null, inherited, accessor-backed, or otherwise malformed values fail with the existing `evidence_measurement_class_malformed:<evidenceId>` precedence.
- `derived` and `estimated` continue to require the same valid closed provenance required of every recorded entry. No new caller-controlled `observed` flag is introduced.

### 2. Prevent caller-only evidence from claiming independent measurement

- Keep existing attribution requirements for every definition that already has `requiresAttribution: true`.
- For an `operator-recorded` definition whose default is `not-observable`, a recorded entry classified as `measured` additionally requires the existing exact dispatch-receipt attribution path and matching replay input.
- The shared effective-attribution decision must be used both by `closeEvidenceEntry(...)` and `gradeEvidenceInventory(...)`; they must not disagree about whether a receipt is required.
- A caller-supplied operator record may remain `not-observable` without a dispatch receipt. `derived` or `estimated` remains classification metadata with valid provenance and cannot change readiness. A caller-only `measured` record without exact attribution fails closed.
- Human-only records continue to require the correct human seat and verified-human evidence reference, never a dispatch receipt. Their measurement class cannot satisfy or bypass Kernel human-evidence validation.

### 3. Preserve authority and readiness semantics

- Do not derive authority from `measurementClass`; retain the separate immutable `authority` field.
- Do not change dependency reasons, missing-evidence reasons, waiting states, human Kernel-validation reasons, attribution reason codes, or the fixture grader's always-blocked readiness projection.
- Do not alter the evidence inventory's identifier count, order, or conditional Simmons behavior.
- Reuse `evaluateSeatDispatchAttributionV1(...)` and the existing replay anchor; no new runtime, seat, executor, or authority identity is introduced.

### 4. Focused tests

Update `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs` to prove:

- every pending entry keeps `measurementClass: null`;
- recorded entries accept each of the four closed classes and reject unknown or malformed classes;
- `estimated` is accepted as a real recorded classification with valid identity and provenance;
- recorded human evidence can preserve each class while still requiring exact verified-human evidence and remaining a Kernel-validation stop;
- caller-only operator evidence defaults to `not-observable` and cannot claim `measured` without exact existing attribution;
- independently attributed operator evidence may be `measured`;
- the new operator-`measured` path accepts only an exact attributed receipt and replay input, while missing attribution input, malformed receipt, stale mission or repository revision, wrong workspace, wrong parent or child session, wrong seat, non-terminal lifecycle, and receipt reuse fail closed with existing reason behavior;
- existing `measured`, `derived`, and `not-observable` fixtures retain their authority, requirement, pending state, and reason behavior;
- measurement-class changes alone cannot alter readiness, satisfy a human gate, or remove a missing-evidence reason;
- recorded-class `null`, unknown, inherited, and accessor-backed values fail without invoking accessors and retain current deterministic measurement-class precedence.

### 5. Content-addressed fixture updates

The May-owned implementation delta may contain exactly these three paths:

- `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`;
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`;
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`.

Within `fixture-identity-v1.json`, only the evidence-inventory framed digest may change. Within `fixture.test.mjs`, only bounded tests for this correction and the independently pinned release-baseline identity-record digest may change.

The complete scope-freeze-base-to-implementation-head delta must contain exactly those three implementation paths plus the two planning artifacts:

- `docs/missions/issue-137-ac4-correction-mission-brief.json`;
- `docs/missions/issue-137-ac4-correction-plan.md`.

Do not change the fixture manifest, driver, verifier, host launcher, isolation worker, template, package identity, or runbook unless Fury first returns `REVISE` identifying an unavoidable contract inconsistency.

## Validation and evidence

May must run, at minimum:

1. add and run a focused test that calls `verifyFixtureIdentity(...)` with the corrected independently pinned release baseline and asserts literal `state === "valid"`;
2. run that executable identity test through `node --test --test-name-pattern='corrected fixture identity baseline verifies the frozen artifact set' benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`;
3. `npm --prefix benchmarks/v0.3-external-acceptance-v1 test`;
4. focused measurement-class and operator-attribution tests proving the four-class matrix, hostile replay cases, and no authority/readiness change;
5. `git diff --check`;
6. exact May-delta and complete-base-delta verification against the path sets above, including field-level checks for the identity record and test baseline.

Executing `verify-fixture-identity.mjs` directly is not validation: that module exports `verifyFixtureIdentity(...)` and has no CLI effect. Do not modify the verifier merely to add a command surface.

Report full outcomes without hiding environmental failures. Bind all conclusions to the exact implementation head.

## Review and stop sequence

1. Commit this plan and tracked mission brief without implementation changes.
2. Fury reviews this exact plan revision.
3. On `REVISE`, Hill corrects only the plan and returns the new exact plan revision to the same Fury thread.
4. On `APPROVE`, Hill records the new exact plan commit and digest, verifies PR #168 readback at that head, and calls the existing Delivery Workspace and specialist-dispatch guards with the complete bindings defined above.
5. A result other than literal `dispatch_ready`, or any absent current permission binding required by the selected May executor, stops implementation.
6. May implements only this approved plan.
7. Fury performs exact-head conformance review after implementation.
8. Stop at the corrected exact revision for Mack validation.
9. Do not run AC2 externally, close #137, begin #29, merge, deploy, or release in this mission.
