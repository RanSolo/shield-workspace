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

1. Preserve the existing V1 constants, receipt/result types, validators,
   preparation function, readiness helper, initial-preparation behavior, and
   exact-replay bytes. Add these explicit compatibility surfaces instead of
   widening a V1 return type in place:
   - `WORKTREE_STATE_SUCCESSOR_CONTRACT_VERSION = "worktree.state.v2"`;
   - `WorktreeStateReceiptV2` and strict `validateWorktreeStateReceiptV2`;
   - `validateWorktreeStateReceiptV1OrV2` for upgraded file consumers;
   - `WorktreePreparationResultV2`, whose exact fields are `schemaVersion`,
     `contractVersion`, `authority`, `state`, `reasonCode`, `summary`,
     `nextAction`, `sourceRoot`, `destinationRoot`, `exclusions`, `receipt`, and
     `receiptDigest`, and whose closed states are `refreshed`,
     `already_refreshed`, `blocked`, and `recovery_required`;
   - `prepareOrRefreshWorktreeStateV2`, used by the CLI, and an explicit V2
     readiness predicate.

   V2 receipt fields are exactly `schemaVersion`, `contractVersion`,
   `authority`, `state`, `reasonCode`, `summary`, `repositoryId`,
   `commonGitDirectory`, `destination`, `policy`, `publicBindings`,
   `trackedBaselineExclusions`, `installedPaths`, `installedByteDigests`, `exclusions`,
   `supersedes`, and `receiptDigest`. `supersedes` contains exactly
   predecessor contract version, receipt digest, destination branch, and
   destination HEAD. V2 deliberately excludes V1's mutable source Git
   observation; exact policy byte/semantic digests and bindings carry the
   relevant source-policy identity. Therefore one predecessor plus one current
   destination observation produces one deterministic successor regardless of
   which exact governed source worktree supplies the same policy bytes. V2
   result digest input is canonical JSON of every result field except the outer
   `receiptDigest`, exactly mirroring V1's digest rule. `refreshed` carries the
   new V2 receipt and reason `prepared_state_refreshed`; `already_refreshed`
   carries it with reason `already_refreshed`; `blocked` carries `null` and the
   V1 blocked reasons plus only `predecessor_not_ancestor`,
   `predecessor_branch_mismatch`, `receipt_chain_invalid`, and
   `refresh_conflict`; `recovery_required` carries a V2 receipt or `null` and
   reason `filesystem_outcome_uncertain`. The CLI JSON projection is this exact
   union; the human projection prints `REFRESHED` or `ALREADY REFRESHED` plus
   destination, repository, branch, HEAD, active receipt, and predecessor
   receipt. Initial preparation and V1 replay still return the existing V1
   result unchanged.
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
   the predecessor digest and current exact branch/HEAD. A file-aware validator
   follows a unique digest-linked chain to the initial V1 receipt, rejects
   cycles, duplicate digests, missing/extra archive entries, or more than 256
   predecessors, and never accepts an archive as the active receipt. No archive
   row is authority or mission state.
4. Reuse the destination-scoped exclusive lock and retained no-follow
   descriptors. Reobserve source policy, predecessor active receipt, archive,
   branch, HEAD, ancestry, cleanliness, tracked baseline, mission-state roots,
   and filesystem identities immediately before installation and before
   success. Concurrent refresh either observes the exact successor replay or
   returns the existing in-progress/conflict classification; it never overwrites
   a newer successor.
5. Stage, sync, and exact-readback the archive and successor receipt before an
   atomic active-receipt replacement. The ordinary command implements this
   closed durable-state table without deleting ambiguous locks or temporaries:

   | Durable observation before lock acquisition | Result |
   | --- | --- |
   | valid old active, no archive/temp/lock | begin refresh under a newly acquired lock |
   | exact predecessor archive plus valid old active, no temp/lock | resume successor staging under lock |
   | exact predecessor archive plus exact mutually-bound new active, no temp/lock | `already_refreshed`, no writes |
   | new active without its exact predecessor archive | `recovery_required` |
   | any temporary/staging path without a provably live owned operation | `recovery_required`, no cleanup |
   | any pre-existing lock | `preparation_in_progress`, no cleanup or mutation |
   | malformed/substituted archive or active receipt | `prepared_state_stale` before mutation |
   | archive plus old active after an interrupted pre-replacement sync | resume only after exact archive/readback and all live facts revalidate |
   | archive plus new active after replacement or directory-sync uncertainty | exact replay succeeds only after active/archive mutual binding and all live facts revalidate; otherwise `recovery_required` |

   File-create, file-sync, archive readback, successor-create, successor-sync,
   atomic replacement, active readback, directory-sync, and lock-release are
   separate injectable seams. Any uncertain post-mutation result is
   `recovery_required`. An abrupt interruption fixture exercises every boundary.
6. Refresh must not copy, delete, rewrite, absorb, classify, or authorize
   journals, reports, tmp data, audit evidence, dispatch receipts, signer data,
   passcodes, caches, or other mission state. Production captures and retains
   the configured mission-state root and ancestor directory descriptors, checks
   owner/mode/no-follow identity before replacement and before success, and
   never enumerates or issues a write beneath those roots. It revalidates exact
   Git-tracked baseline files with the existing retained-descriptor byte proof.
   It does **not** claim a recursive snapshot of arbitrary untracked mission
   contents. Tests retain representative journal/audit/tmp files and assert
   their bytes and identities remain unchanged. Journal/schema validity remains
   owned by the mission subsystem.
7. `shield doctor` validates V1 and V2 active receipts. A valid V2 successor at
   the current branch/HEAD remains the existing healthy prepared-worktree
   classification while reporting its active receipt digest. A stale
   predecessor, missing or substituted archive, broken predecessor chain,
   policy drift, unsafe mission-state identity, or repository drift remains
   unhealthy.
8. Upgrade the legacy and committed-plan reviewed-transition hosts through the
   explicit V1-or-V2 file-aware chain validator. Each consumer independently
   observes and binds active receipt root, repository, common Git directory,
   branch, HEAD, policy bytes, and—when V2—the exact archived predecessor chain
   before consuming provenance. It then continues to independently reobserve
   journal, signer, dispatch, plan, and authority facts. The strict V1 validator
   remains unchanged. Receipt refresh never grants or extends mission authority.

## Acceptance matrix

| ID | Requirement | Evidence |
| --- | --- | --- |
| WRF-1 | Clean same-branch strict fast-forward refreshes through ordinary `worktree prepare`. | Real linked-worktree and CLI tests. |
| WRF-2 | Equal HEAD is byte-identical replay; descendant creates one deterministic successor. | Active/archive byte and digest assertions. |
| WRF-3 | Successor binds current branch/HEAD and exact predecessor identity. | V2 validator and substitution vectors. |
| WRF-4 | Policy, tracked baseline, and configured mission-root identities remain exact; refresh never writes mission contents. | Retained descriptors plus representative before/after byte fixtures. |
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
- `packages/shield-team-system/src/legacy-reviewed-transition-v1.mts`
- `packages/shield-team-system/src/copilot-fury-reviewed-transition-host-v1.mts`
- `packages/shield-team-system/tests/worktree-state-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/config.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`

No mission journal schema, reviewed-transition plan/result/dispatch contract,
signer, human authority, implementation authority, model dispatch,
publication, merge, deployment, release, final acceptance, worktree cleanup,
or unrelated Nx project change is in scope.

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
