# Issue #278 — validation prerequisite corrective plan

## Frozen identity and boundary

- Mission: `mission:issue-278`
- Subject: `github:RanSolo/shield-workspace/issue/278`
- Parent lane: issue #226 Alpha
- Repository: `RanSolo/shield-workspace`
- Base and planning parent: `origin/main` at
  `f639e89cee448f8e254fb738d52b0a08c6c304c8`
- Branch: `agent/issue-278-validation-prerequisite`
- Diagnosis: AC-1 is a pre-existing stale expectation; AC-2 is a pre-existing
  harness/environment-isolation defect; neither is a #226 corrective defect.
- Authority state: planning only. May implementation is prohibited until Fury
  approves the exact plan revision and Coulson grants exact Wheels Up authority.

The implementation scope is exactly two dependency-ordered, independently
reviewable one-acceptance-criterion packets. The authority envelope must not
add paths merely because they could be related.

## Packet A — AC-1: hosted May expectation follows governed configuration

- Acceptance criterion: issue #278 `AC-1` only.
- Requirement/finding: the current hosted May profile selects `gpt-5.6-sol`,
  while the agent-boundary test still expects the obsolete
  `gpt-5.3-codex-spark` identity.
- Intended invariant: the boundary test continues to prove the complete hosted
  May seat and authority contract while its explicit model assertion agrees
  with the reviewed `.codex/agents/may.toml` configuration. No agent model or
  runtime configuration changes.
- Exact minimal implementation path:
  `packages/shield-team-system/tests/agent-boundaries.test.mjs`.
- Required existing interface (read-only context): `.codex/agents/may.toml`.
- Allowed effect: change only the stale hosted-May model expectation needed to
  match the already-governed configuration; preserve every seat-boundary and
  authority assertion.
- TDD classification: expectation correction, not product Green. Preserve the
  original failure as addressable Mack evidence; record intent-preservation
  rationale; require Fury disposition and Fitz verification of the changed
  expectation.
- Focused validation:

  ```text
  npm run build --workspace @shield/team-system
  node --test --test-name-pattern='May profiles preserve blueprint boundaries across local and hosted runtimes' packages/shield-team-system/tests/agent-boundaries.test.mjs
  ```

- Expected output: the focused test passes and all non-model assertions remain
  byte-for-byte unchanged.
- Stop conditions: any need to edit `.codex/agents/may.toml`, another agent
  profile, production code, another test, or weaken/remove a boundary
  assertion; any result inconsistent with the established stale-expectation
  classification.
- Checkpoint: one coherent commit containing only this path. Packet B starts
  only from the accepted Packet A checkpoint.

## Packet B — AC-2: signer-bootstrap stderr is color-environment isolated

- Acceptance criterion: issue #278 `AC-2` only.
- Requirement/finding: the signer-bootstrap test's child process inherits
  parent `NO_COLOR`/`FORCE_COLOR`; Node emits a color-precedence warning on
  child stderr before the test can evaluate signer-bootstrap output.
- Intended invariant: the test deterministically controls color-related child
  environment at the narrow signer-bootstrap harness boundary, while retaining
  exact empty-stderr assertions so any genuinely unexpected child warning,
  command failure, or product defect remains visible and failing.
- Exact minimal implementation path:
  `packages/shield-team-system/tests/supervised-cli.test.mjs`.
- Required existing interface: the file-local `run(...)` helper and the
  existing signer-bootstrap test; no production CLI interface changes.
- Allowed effect: add the smallest test-local environment isolation and
  focused coverage proving the signer-bootstrap contract both with clean
  parent color state and with conflicting parent `NO_COLOR`/`FORCE_COLOR`.
  Do not globally suppress stderr or warnings.
- TDD classification: closed regression contract. The contaminated-parent run
  is Red for the established warning and the sanitized-parent run is the
  control; Green is the smallest test-harness-only isolation that makes both
  variants prove the same signer-bootstrap behavior.
- Focused validation:

  ```text
  env -u NO_COLOR -u FORCE_COLOR node --test --test-name-pattern='pre-init signer bootstrap emits only a credential-free packet and creates fresh protected candidates' packages/shield-team-system/tests/supervised-cli.test.mjs
  env NO_COLOR=1 FORCE_COLOR=1 node --test --test-name-pattern='pre-init signer bootstrap emits only a credential-free packet and creates fresh protected candidates' packages/shield-team-system/tests/supervised-cli.test.mjs
  ```

- Expected output: both focused invocations pass; the test still requires
  credential-free stdout, protected fresh signer candidates, successful child
  status, and empty unexpected child stderr.
- Stop conditions: any need to change production CLI/signer code, shared
  process environment globally, hide stderr/warnings generally, weaken output
  or filesystem assertions, or touch a path outside this packet.
- Checkpoint: one coherent commit containing only this path.

## Cumulative exact-revision validation and review

After both packet checkpoints, Mack independently validates the exact clean
HEAD with:

```text
npm exec -- nx run @shield/team-system:test --skipNxCache
git diff --check
```

Mack also reruns both packets' focused commands, verifies the base-to-HEAD path
set is exactly the mission brief, this plan, and the two authorized test paths,
and retains FAIL for every observed failure. Fury then reviews that exact HEAD
for conformance and specifically confirms no expectation, seat boundary,
stderr, warning, failure, or credential-safety assertion was weakened. Fitz
must verify the AC-1 changed expectation before final acceptance.

## Exclusions and terminal condition

No agent-model/configuration edit, production change, #226 worktree or
implementation edit, unrelated test cleanup, broad environment sanitization,
warning suppression, publication, merge, deploy, release, or final acceptance
is permitted. This mission stops after exact-head Mack and Fury evidence and
the separately governed publication gate, if later authorized. After #278 is
merged by its human owner, Alpha returns to preserved #226 for non-destructive
fresh-main reconciliation and new exact-head Mack/Fury gates.
