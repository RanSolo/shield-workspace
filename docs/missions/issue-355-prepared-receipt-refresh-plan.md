# Issue #355 — prepared-worktree receipt refresh

## Frozen identity

- Parent proving campaign: `#341`
- Triggering correction: `#353`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-355-prepared-receipt-refresh`
- Planning base and pre-plan HEAD: `887c7bcf5cd457129fd376a73b2047a0ea5f8cb0`
- Subject: `github:RanSolo/shield-workspace/issue/355`
- Preserved mission: `mission:issue-341-cold-hill-intake`
- Preserved historical Fury receipt: `receipt:kvJpFeA5sXIxpjS78gw26U9svFbdV320`
- Authority while planning: `none`

## Observed rail edge

The unchanged #341 replay uses a stable worktree whose policy bytes, public
bindings, repository identity, and mission-local state remain valid. Its branch
legitimately advanced after the original preparation receipt was installed.
`shield doctor` therefore reports `stale_or_malformed_worktree_state`, and an
authority-none `shield worktree prepare` retry returns
`prepared_state_stale`. The immutable V1 receipt has no supported successor
operation, so a reusable Alpha, Bravo, or Hill worktree becomes permanently
unusable after ordinary forward delivery.

No journal, authority, signer, audit artifact, dispatch receipt, passcode, or
historical evidence was modified while reproducing the stop.

## Objective

Extend the existing authority-none `shield worktree prepare` clockwork path to
refresh an exact prepared-worktree receipt after a proven clean same-branch
fast-forward. The caller supplies only source and destination roots. The host
derives the predecessor, current repository state, ancestry, policy, tracked
baseline, and successor identity. No separate repair ritual or caller-authored
refresh packet is introduced.

## Contract

1. Preserve every V1 initial-preparation and exact-replay behavior. Add a
   successor receipt contract whose active receipt is `worktree.state.v2` and
   whose closed `supersedes` record contains the predecessor receipt contract,
   digest, destination branch, and destination HEAD. The successor remains
   public provenance with `authority: "none"`.
2. `shield worktree prepare --source-root <source> --root <destination>` is the
   only operator command. It returns `refreshed`/`REFRESHED` only when the
   installed receipt is valid for its recorded state and the host independently
   proves all of the following:
   - identical canonical destination root, repository identity, and common Git
     directory;
   - the same attached destination branch;
   - a clean destination worktree;
   - current destination HEAD is a strict Git descendant of the predecessor
     HEAD;
   - source policy and installed config, registry, generated ignore bytes,
     semantic policy, public bindings, and configured mission-state roots are
     exact;
   - current tracked baseline and admitted mission-state identities are safe.
   Equal HEAD remains exact idempotent replay. Detached, renamed-branch,
   rewritten, divergent, dirty, substituted, malformed, or unsafe states stop
   before mutation.
3. Preserve the predecessor receipt bytes in an append-only content-addressed
   public receipt archive beneath `.shield/worktree-state-receipts/<digest>.json`
   before activating the successor. Archive filename, embedded digest, and
   exact bytes must agree. Existing archive replay is exact and non-mutating;
   collision or substitution fails closed. The active successor receipt binds
   the predecessor digest and current exact branch/HEAD. No archive row is
   authority or mission state.
4. Reuse the destination-scoped exclusive lock and retained no-follow
   descriptors. Reobserve source policy, predecessor active receipt, archive,
   branch, HEAD, ancestry, cleanliness, tracked baseline, mission-state roots,
   and filesystem identities immediately before installation and before
   success. Concurrent refresh either observes the exact successor replay or
   returns the existing in-progress/conflict classification; it never overwrites
   a newer successor.
5. Stage, sync, and exact-readback the archive and successor receipt before an
   atomic active-receipt replacement. A filesystem, sync, replacement,
   readback, directory-sync, or lock-release uncertainty after mutation may
   begin returns `recovery_required`. Recovery accepts success only when the
   archive and active successor are both complete, exact, and mutually bound;
   otherwise automation stops. Never report success from a lone archive, lone
   successor, temporary file, or ambiguous active receipt.
6. Refresh must not copy, delete, rewrite, absorb, classify, or authorize
   journals, reports, tmp data, audit evidence, dispatch receipts, signer data,
   passcodes, caches, or other mission state. Capture exact bytes and filesystem
   identities before refresh and prove them unchanged afterward. Journal/schema
   validity remains owned by the mission subsystem.
7. `shield doctor` validates V1 and V2 active receipts. A valid V2 successor at
   the current branch/HEAD remains the existing healthy prepared-worktree
   classification while reporting its active receipt digest. A stale
   predecessor, missing or substituted archive, broken predecessor chain,
   policy drift, unsafe mission-state identity, or repository drift remains
   unhealthy.
8. Consumers, including the #341 reviewed-transition compositor, treat the
   refreshed receipt only as current public provenance and continue to
   independently reobserve live repository, journal, signer, dispatch, and
   authority facts. Receipt refresh never grants or extends mission authority.

## Acceptance matrix

| ID | Requirement | Evidence |
| --- | --- | --- |
| WRF-1 | Clean same-branch strict fast-forward refreshes through ordinary `worktree prepare`. | Real linked-worktree and CLI tests. |
| WRF-2 | Equal HEAD is byte-identical replay; descendant creates one deterministic successor. | Active/archive byte and digest assertions. |
| WRF-3 | Successor binds current branch/HEAD and exact predecessor identity. | V2 validator and substitution vectors. |
| WRF-4 | Policy and all mission-local state remain byte- and identity-identical. | Before/after retained descriptor evidence. |
| WRF-5 | Dirty, detached, branch-renamed, rewritten, divergent, repository/policy/baseline drift fails before mutation. | One negative vector per boundary. |
| WRF-6 | Archive, active replacement, concurrency, interruption, and durability uncertainty fail closed and recover deterministically. | Fault-injection and race matrix. |
| WRF-7 | Doctor recognizes only a complete exact successor chain as healthy. | Doctor/config tests for valid and malformed chains. |
| WRF-8 | Package and CLI surfaces remain closed and backward compatible. | Package consumer, help, JSON, and human projection tests. |
| WRF-9 | Preserved #341 mission advances beyond `prepared_state_stale` without repeated intake, planning, or human decisions. | Exact proving replay with tool host `887c7bc`. |

## Bounded paths

- `docs/missions/issue-355-prepared-receipt-refresh-plan.md`
- `docs/operations/worktree-state.md`
- `packages/shield-team-system/src/worktree-state-v1.mts`
- `packages/shield-team-system/src/cli.mts`
- `packages/shield-team-system/tests/worktree-state-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/config.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

No mission journal schema, signer, human authority, implementation authority,
reviewed-transition contract, model dispatch, publication, merge, deployment,
release, final acceptance, worktree cleanup, or unrelated Nx project change is
in scope.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- focused worktree-state, CLI, config, and package-surface tests
- `npm exec -- nx affected -t build test --base=887c7bcf5cd457129fd376a73b2047a0ea5f8cb0 --head=<exact-implementation-head> --exclude=@shield/multiband --nxBail`
- `git diff --check 887c7bcf5cd457129fd376a73b2047a0ea5f8cb0..<exact-implementation-head>`

## Stop conditions

Return to Fury if safe refresh requires caller-authored identity, branch-name
trust without ancestry, destructive receipt or mission-state deletion, policy
weakening, silent recovery from ambiguous replacement, journal
reinterpretation, human authority change, or scope outside the bounded paths.

## Proving disposition

After Mack and Fury technical clearance, rebuild the external tool host and run
the same #341 `worktree prepare` followed by
`continue-legacy-reviewed-transition`. Preserve the old REVISE receipt and all
mission evidence. Record and immediately pursue the next deterministic rail
edge. #355 contributes to but does not close #341.
