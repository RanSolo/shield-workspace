# Issue #353 — phase-aware Fury architecture-plan review

## Frozen identity

- Parent proving loop: `#341`
- Issue: `#353`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-353-phase-aware`
- Planning base and pre-plan HEAD: `7773281a28787e8a396adaf998375d84b139f7b5`
- Subject: `github:RanSolo/shield-workspace/issue/353`
- Preserved historical receipt: `receipt:kvJpFeA5sXIxpjS78gw26U9svFbdV320`
- Historical combined prototype: `887c7bcf5cd457129fd376a73b2047a0ea5f8cb0`
- Authority while planning: `none`

## Current-main evidence

Current main still emits and validates only the V1 Fury plan-review contracts.
The reviewed-transition host creates V1 requests, while the selected Fury card
unconditionally asks for Mack evidence. That permits a pre-implementation plan
review to demand evidence that can exist only after Coulson, May, and Mack,
creating a cycle.

The historical #353 implementation proved the intended V2 contract, but it is
based on an abandoned pre-#361 lineage. PRs #361 and #363 independently replaced
the same dispatcher, host, legacy, and CLI surfaces. No historical commit may be
cherry-picked or replayed. The implementation must port only the phase-aware
contract onto the exact current-main APIs.

## Objective

Add a backward-compatible V2 production plan-review contract that explicitly
binds `architecture_plan`, echoes the exact repository revision, and admits
only architecture-plan findings. Keep historical V1 evidence replayable without
upgrading, mutating, or reinterpreting it.

## Closed contract

1. Add V2 request and result contract versions in the existing dispatcher core.
   V2 requests require `reviewPhase: "architecture_plan"`. V2 results require
   the same phase plus `repositoryRevision`, equal to the request's exact
   40-character `headRevision`.
2. Production reviewed-transition preparation emits V2 only. V1 validators and
   evidence remain replay/readback-only for historical records.
3. Freeze V2 findings to:
   - `PLAN_SCOPE_INVALID`
   - `PLAN_AUTHORITY_INVALID`
   - `PLAN_SEQUENCE_INVALID`
   - `PLAN_BINDING_INVALID`
   - `PLAN_API_ASSUMPTION_INVALID`
   - `PLAN_TEST_STRATEGY_INSUFFICIENT`
   - `PLAN_EXCLUSION_INVALID`
   - `PLAN_DETERMINISM_INVALID`
   - `PLAN_REPLAY_INVALID`
   - `PLAN_IDENTITY_SEPARATION_INVALID`
   - `PLAN_COMPATIBILITY_INVALID`
4. `PASS` requires zero findings. `REVISE` requires one or more findings from
   that closed set. Unknown or out-of-phase codes, including
   `BOUND_REVISION_EVIDENCE_ABSENT`, are malformed model output and follow the
   existing bounded repair/fail-closed path.
5. The V2 prompt and packet review only planned scope, authority, sequence,
   bindings, API feasibility, exclusions, determinism, replay, identity
   separation, compatibility, and test strategy. They explicitly forbid
   requiring completed May implementation, Mack validation, publication,
   final acceptance, or later human evidence.
6. Make the repository Fury card phase-aware. `architecture_plan` consumes the
   host-bound plan/repository packet. `implementation_conformance` retains the
   Mack packet requirement. The card grants no authority and cannot widen the
   host contract.
7. V2 request/packet/result identity participates in packet, claim, evidence,
   replay, recovery, and terminal readback digests. Include
   `repositoryRevision` in the V2 logical operation and parent-session identity.
8. V1 replay must bind the exact historical request, packet, result, receipt,
   repository revision, and evidence identity. It may replay byte-for-byte but
   never enter a fresh production dispatch or be translated to V2.
9. A card or contract change creates a fresh semantic V2 dispatch identity. The
   historical #341 REVISE receipt remains immutable.

## Acceptance matrix

| ID | Requirement | Evidence |
| --- | --- | --- |
| FPR-1 | Production plan review is explicitly `architecture_plan`. | V2 request, prompt, packet, host-seed, and result tests. |
| FPR-2 | Exact phase, repository revision, and plan identities are echoed and host-validated. | Positive and substituted phase/revision/plan vectors. |
| FPR-3 | Mack and post-implementation evidence are forbidden for plan PASS. | Committed-file and legacy-derived PASS fixtures without Mack input. |
| FPR-4 | Out-of-phase findings cannot become terminal REVISE. | Unknown-code, `BOUND_REVISION_EVIDENCE_ABSENT`, repair, and exhausted-repair vectors. |
| FPR-5 | Legitimate architecture findings still produce REVISE. | Every allowed code plus PASS/findings cardinality checks. |
| FPR-6 | Historical V1 evidence is replay-only and unchanged. | Exact V1 request/result/evidence/receipt replay and substitution tests. |
| FPR-7 | V2 identity includes exact current HEAD. | Logical-operation, parent-session, packet, claim, and head-drift vectors. |
| FPR-8 | Corrected #341 request is fresh and old receipt immutable. | Legacy fixture derives distinct V2 identity while preserving the old receipt. |
| FPR-9 | Public package and CLI fixtures remain coherent. | Package-surface and supervised-CLI tests updated only for V2 host output. |
| FPR-10 | Validation stays cache-enabled and excludes Multiband. | Exact-SHA Nx affected evidence. |

## Bounded paths

- `.github/agents/fury.agent.md`
- `docs/missions/issue-353-fury-plan-phase-plan.md`
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`
- `packages/shield-team-system/src/copilot-fury-reviewed-transition-host-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- `packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

No Mack carrier, validation execution, mission-authority change, receipt-ledger
rewrite, legacy/CLI production change, publication, `prepare-next` expansion,
merge, deployment, release, final acceptance, or historical evidence mutation
is in scope.

## Implementation sequence

1. Port the closed V2 request/result/taxonomy and phase-aware prompt into the
   current dispatcher core and adapter without restoring historical #349 code.
2. Make the current reviewed-transition host emit V2 committed/derived seeds,
   retain V1/V2 readback, bind exact current HEAD into operation/session
   identity, and preserve V1 replay-only semantics.
3. Update the Fury card and the five bounded test surfaces. Adapt current #361
   fixtures; do not restore stale historical fixtures.
4. Run focused tests, package surface, then exact-SHA Nx affected build/test with
   normal cache and `--exclude=@shield/multiband`.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- `npm exec -- nx run @shield/team-system:test:copilot-fury-plan-dispatch`
- focused Node tests for reviewed-transition host, legacy reviewed transition,
  package surface, and supervised CLI through `npm exec -- nx exec`
- `npm exec -- nx affected -t build test --base=7773281a28787e8a396adaf998375d84b139f7b5 --head=<exact-implementation-head> --exclude=@shield/multiband --nxBail`
- `git diff --check 7773281a28787e8a396adaf998375d84b139f7b5..<exact-implementation-head>`

## Stop conditions

Return to Fury if the port requires weakening exact host readback, accepting
open finding codes, mutating V1 evidence, requiring Mack before plan review,
changing human authority, editing legacy/CLI production surfaces, or widening
into publication, merge, deployment, release, or final acceptance.

## Proving disposition

After Mack and Fury technical clearance, replay the unchanged #341 mission
through the corrected tool host. Preserve the old REVISE receipt and record the
next rail edge. #353 does not close #341.
