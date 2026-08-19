# Issue #311 — Clockwork final-publication transition

## Frozen mission identity

- Repository: `RanSolo/shield-workspace`
- Issue: `#311 — Clockwork final-publication transition`
- Branch: `agent/issue-311-clockwork-publication`
- Planning base and pre-plan HEAD:
  `a01d9dd20e055b3483e4fead9c2647750c28ec8a`
- Implementation base: the exact commit containing this plan after Fury PASS
  and Coulson Wheels Up; May must not infer a newer base.
- Mission: `mission:issue-311-clockwork-final-publication`
- Subject: `github:RanSolo/shield-workspace/issue/311`
- Authority while planning: `none`

The objective is one operator command that composes the merged mission
preparation, semantic publication-authority classification, Guided Review
authorization, and GitHub draft-publication machinery into a safe final
transition. The command must stop at a concise human decision when authority
is required, resume existing canonical state, and return one durable draft-PR
receipt without rebuilding publication identity or weakening any human gate.

Fury plan review is technical evidence only. It does not authorize
implementation. Implementation starts only after the repository CLI renders
the exact Authorize Wheels Up manifest and Coulson enters the genuine PIN.

## Repository-grounded observations

The following prerequisites are already merged at the frozen planning HEAD
and are reuse-only dependencies:

1. `mission-preparation-host-v1.mts` derives the protected graph, exact
   base-to-HEAD changed paths, confined publication effects, and the closed
   `publication_ready` / `publication_already_authorized` outcomes.
2. `review-publication-v1.mts` owns canonical semantic publication identity;
   `review-publication-executor-v1.mts` owns Guided Review policy, PIN,
   signing, freshness, and atomic authorization append.
3. `profile-aware-mission-v1.mts` owns adapter-v2 request/result identity,
   canonical authority consumption, replay, and duplicate rejection.
4. `github/publication-gate.mjs`, `github/pr-workspace.mjs`, and
   `github/adapter-v1.mjs` own journal-gated GitHub delivery, publication
   scope evaluation, exact-draft reuse, and receipt validation.
5. The merged Issue #309 plan is the exact plan-only predecessor scenario.
   Its launcher is authority-neutral teammate-demo preparation, not a general
   Mack/Fury runner. Issue #311 uses separate disposable exact-revision
   worktrees and must not detach a governed implementation worktree.

These dependencies include the merged #286 prepared-publication seam and #279
semantic identity/idempotency work. Issue #311 must compose them. It must not
replace, fork, or reimplement them.

One unresolved failure boundary remains in the existing queued-request to
result-record path: a process can stop after a Git/GitHub effect but before the
journal result append. The smallest new state is therefore a publication
claim/receipt ledger plus read-only GitHub reconciliation. It is not a second
publication identity or a replacement mission journal.

## Frozen transition

### Packet A — caller-free preparation and safe attachment

Add `final-publication-transition-v1.mts` as a package-internal orchestrator.
Its closed operator input is repository root, mission ID, base branch, and the
existing Guided Review/passcode options. It accepts no caller-authored
authorization, paths, effects, request, result, receipt, title, body, Mack
verdict, Fury verdict, or human approval.

The orchestrator replays the protected graph and profile-aware mission. It
derives the expected implementation branch only from the unique canonical
current initial-publication authority lineage, then observes canonical root,
configured and origin repository identity, worktree inventory, status, HEAD,
and local branch ref.

- An attached worktree continues only on the exact expected branch and HEAD.
- A detached worktree may perform exactly one non-creating
  `git switch --no-guess <expected-branch>` only when repository/root identity
  matches, status is clean, the expected local ref resolves exactly to HEAD,
  and no other worktree owns that branch. The complete observation is repeated
  after attachment.
- Missing refs, branch aliases, another owner, dirty state, repository drift,
  HEAD drift, or uncertain Git termination fails before publication effects.

The orchestrator calls the existing mission-preparation facade and maps only
its canonical semantics:

| Canonical state | Final-transition disposition |
| --- | --- |
| `publication_ready` | `supersedable`; use the existing prepared authorization path |
| `publication_already_authorized` | `reusable`; skip decision, signer, and append |
| one same-authority queued or delivered request | `consumed`; resume only through Packet B |
| failed, foreign, or multiple request chains | `consumed`; stop with one recovery action |
| stale, non-equivalent, alias-conflicted, or ambiguous history | `incompatible`; stop before effects |

The transition never recomputes semantic identity. `supersedable` delegates to
the existing prepared publication executor and preserves the existing
Guided Review omitted/optional/mandatory choice matrix, explicit cancel with
no effect, PIN/signing behavior, atomic append, durable session resume, and
fresh replay after every key turn. `reusable` never prompts or appends.

### Packet B — execute-once claim and reconciliation

Add `final-publication-receipt-store-v1.mts` as a confined append-only ledger
at `.shield/final-publication-receipts.jsonl`. It uses exclusive locking,
no-follow regular-file checks, exact replay, file sync, parent-directory sync,
and readback. Its claim preimage is a closed canonical object binding the
canonical mission revision, final semantic authority, repository, branch,
base, HEAD, operation, target, publication authorization, proposed paths,
requested effects, title digest, and body digest. It deliberately excludes
`requestId`, `candidateId`, `sourceRef`, and `capturedAt`. SHA-256 of that
preimage is the claim digest.

The closed states are:

- `started`: the unique claimant was durably recorded before any Git/GitHub
  effect;
- `delivered`: one exact draft receipt was durably reconciled;
- `not_applied`: absence of both remote branch and matching PR was proven;
- `recovery_required`: effect state is mismatched, ambiguous, or unobservable.

`started` contains a random one-time claimant capability retained only by the
process that won the exclusive append. The persisted record stores only its
SHA-256 commitment. Possession is checked under the ledger lock before every
effect and before appending any negative or intermediate terminal state. Only
that first claimant may execute, terminalize `not_applied`, or terminalize
`recovery_required`. It atomically appends the existing communication request
through the existing mission store, reloads and revalidates the
request/authority, and invokes the existing GitHub delivery.

Concurrent or restarted non-claimants replay the ledger and never invoke push
or PR creation. A non-claimant may append `delivered` only after exact positive
readback proves the final draft. Absence, branch-without-PR, mismatch, lookup
failure, or uncertainty returns a non-mutating actionable stop while a
`started` claim exists. It cannot race the live claimant by converting an
intermediate observation into terminal state. The original claimant may
append `not_applied` only after a proven pre-effect failure with both remote
branch and matching PR absent. A process crash that loses the claimant
capability deliberately remains readback-only unless positive delivery is
later proven; it is never made effect-retryable.

Extend `github/pr-workspace.mjs` with one readback-only reconciliation helper
that reuses current lookup, scope, and receipt validation:

- exact remote branch HEAD plus exactly one open draft with exact repository,
  base, head branch, title, and body is `delivered`;
- proven absence of both the remote branch and matching PR is `not_applied`;
- exact remote branch with no PR, any mismatch, multiple matches, lookup
  failure, or uncertainty is `recovery_required`.

Before the first push, an absent remote branch permits one push, an exact HEAD
skips push, and any other value blocks. Any nonzero or uncertain child result
enters readback-only reconciliation. Unknown state must never be converted to
a retryable failure.

Derive deterministic `requestId`, `candidateId`, and `sourceRef` from the claim
digest with separate domain-tagged SHA-256 formulas, then construct the exact
adapter-v2 request. Capture the sole host-trusted `capturedAt` before appending
`started`; store it once in the closed identity envelope. The `started` record
also stores a digest over the claim digest, all three derived IDs, and that
timestamp. Replay recomputes the claim digest and three derived IDs, validates
the stored timestamp and complete envelope digest, and never recaptures or
claims to derive `capturedAt`. The terminal record stores the complete exact
validated communication-result candidate, or enough canonical receipt/scope
material to reconstruct byte-identical candidate fields.

Persist a terminal publication receipt and exact result candidate before
appending that existing trusted candidate to the mission journal. On restart,
a delivered receipt with a missing result appends the byte-identical candidate
once under the existing journal CAS. A matching result returns the same URL; a
mismatch fails closed. `started` and `recovery_required` remain readback-only.
`not_applied` is actionable and terminal; it is not silently retried.

All publication inputs are derived:

- repository owner/name from configured `repositoryId`;
- branch, base, HEAD, paths, and effects from the canonical authority;
- operation exactly `publish_mission_brief`;
- target from `githubPRWorkspaceTargetRef`;
- mission brief path from the protected graph's tracked `parentPlanPath`,
  which must be committed and included in authorized paths;
- title/body from one fixed renderer binding mission ID, subject, exact HEAD,
  paths, exclusions, and explicit draft-only / no-merge / no-deploy /
  no-release / no-final-acceptance language.

The target base branch is derived read-only from GitHub's unique canonical
repository default branch and its live origin ref must equal the authority
base on every execution or reconciliation pass. `--base-branch` is retained
only as a required operator equality assertion against that observed canonical
default; it cannot select topology. A missing, renamed, aliased, ambiguous, or
drifted default branch fails before effects.

### Packet C — one command and closed output

Add:

```text
shield mission publish-reviewed \
  --mission-id <id> \
  --base-branch <branch> \
  [--root <path>] \
  [existing Guided Review options] \
  [--passcode-stdin] \
  [--human|--json]
```

Human output contains only semantic classification, the required human
decision, action/result, durable URL/receipt, or one actionable stop. Raw
journal entries, signer data, request/result JSON, command transcripts, and
host paths are not printed.

The #309 integration is an operator proof, not a fabricated unit-test verdict.
Issue #309 supplies the plan-only predecessor scenario; its teammate-demo
launcher is not a general specialist runner and must not be misused at an
arbitrary #311 implementation revision. Hill creates two absent disposable
exact-revision worktrees with fixed `git worktree add --detach` commands from
the governed repository, proves their HEADs, and routes the registered Mack
and Fury custom agents to those roots. The specialists return genuine terminal
packets to Hill; neither packet is an input accepted by `publish-reviewed` and
neither becomes SHIELD authority. Hill records the exact commands, host
dispatch receipts, disposable roots, specialist runtime/model/executor
identities, terminal dispositions, governed-worktree branch/HEAD before and
after, final publication receipt, and exact retry result in Hill-owned
`.shield/reports/issue-311-clockwork-final-publication-validation.json`.

Only after both genuine terminal packets does Hill run the built exact-HEAD
`shield mission publish-reviewed` command in the still-attached governed
worktree. The proof ends after one draft URL and one no-effect retry. Technical
review remains an upstream orchestration gate, not a caller assertion accepted
by the command and not a new SHIELD authority class. May must not create the
cumulative report or simulate its evidence. Mack independently returns its own
Mack-owned validation artifact; Hill binds its digest into the cumulative
report alongside Fury's separate host dispatch receipt and terminal digest.

## Acceptance-criteria mapping

| Criterion | Frozen implementation and proof |
| --- | --- |
| AC-1 exact retry | Packets A/B replay canonical authorization, claim, request, terminal receipt, and result; retry reads no PIN and performs no duplicate append, push, or PR create. |
| AC-2 detached repair | Packet A permits only the exact clean/ref-equals-HEAD/repository-match/unowned-branch attachment and reobserves afterward. |
| AC-3 ambiguity before effects | Packets A/B fail on repository, graph, authority, branch, worktree-owner, request, remote, PR, or receipt ambiguity before a new effect. |
| AC-4 exact paths/effects | Packet A delegates exact base-to-HEAD path/effect derivation and containment to merged mission preparation and publication evaluation. |
| AC-5 semantic classification | Packet A exposes reusable, supersedable, consumed, or incompatible before any prompt. |
| AC-6 canonical supersession | Supersedable state delegates unchanged to the merged prepared authorization executor. |
| AC-7 actionable consumed/conflict | Packet A's closed matrix and Packet B's terminal states return one recovery action without raw journal noise. |
| AC-8 concise human transition | Packet C renders only classification, decision, action, and receipt. |
| AC-9 minimum key turns | Existing Guided Review resume and exact-authorization retry are composed; no duplicate review or PIN is introduced. |
| AC-10 execute-once draft | Packet B durably claims before effects, reconciles uncertain outcomes read-only, and records one URL/result. |
| AC-11 authority boundary | The command never claims implementation complete, ready-for-review, merge, deployment, release, or final acceptance. |
| AC-12 #309 integration | The exact operator proof starts from the #309 plan-only predecessor, uses disposable exact-revision Mack/Fury roots and genuine registered terminal packets, preserves the attached governed root, and records one draft receipt plus a no-effect retry without verdict fixtures. |

## Smallest authorized implementation path inventory

May may modify only these product paths:

- `packages/shield-team-system/src/final-publication-transition-v1.mts`
- `packages/shield-team-system/src/final-publication-receipt-store-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/github/pr-workspace.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/public/github.d.mts`

May may add or modify only these focused test paths:

- `packages/shield-team-system/tests/final-publication-transition-v1.test.mjs`
- `packages/shield-team-system/tests/final-publication-receipt-store-v1.test.mjs`
- `packages/shield-team-system/tests/github-pr-workspace.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

No new package, Nx project, plugin, adapter, journal schema, or public authority
contract is justified. The two new modules are internal Team System
composition and durability seams. The only new GitHub public export is the
readback helper needed by the internal transition.

## Exclusions and stop conditions

The following are excluded from May's write authority:

- this reviewed plan and all other `docs/**` paths;
- `mission-preparation-host-v1.mts`, `review-publication-v1.mts`, and
  `review-publication-executor-v1.mts`;
- `profile-aware-mission-v1.mts`, `mission-v2.mts`, and all existing mission
  journal schemas/producers;
- `github/adapter-v1.mjs`, `github/publication-gate.mjs`, and the #309
  teammate launcher;
- package manifests, lockfiles, Nx configuration, signer storage, trusted
  binding registries, and repository trust policy;
- caller-supplied authority/review assertions, journal rewriting, destructive
  cleanup, publication during implementation, PR ready transition, merge,
  deployment, release, or final acceptance.

Stop and return to Hill/Fury if mission brief path, communication operation,
request/result candidate, semantic classification, or GitHub scope cannot be
reused by composition within the authorized inventory. Do not widen paths to
make the design convenient. A malformed/unsafe receipt ledger, uncertain
effect, changed exact revision, missing dependency, or conflicting authority
also fails closed.

## Validation commands

Run through the repository package manager and Nx targets after dependencies
are available:

```text
npm exec nx -- run @shield/team-system:build --skipNxCache
node --test packages/shield-team-system/tests/final-publication-transition-v1.test.mjs
node --test packages/shield-team-system/tests/final-publication-receipt-store-v1.test.mjs
node --test packages/shield-team-system/tests/github-pr-workspace.test.mjs
node --test --test-name-pattern='publish-reviewed|final publication' packages/shield-team-system/tests/supervised-cli.test.mjs
node --test packages/shield-team-system/tests/package-surface.test.mjs
npm exec nx -- run @shield/team-system:test --skipNxCache
git diff --check
```

Negative controls cover every detached-repair predicate, base/HEAD/config/
journal drift, all four authority classifications, Guided Review policy and
cancellation, wrong PIN and signer/CAS failure, concurrent claims paused before
push and between push/PR creation, non-claimant negative-state prohibition,
deterministic request/candidate/source/time replay, malformed or unsafe ledger
state, process stops after claim/push/PR/terminal/result, remote and PR
ambiguity, default-branch alias/drift, exact retry, and prohibited authority
implications.

The cumulative AC-12 operator proof runs these command surfaces rather than a
fixture that asserts specialist success:

```text
test "$(git rev-parse HEAD:docs/missions/issue-309-teammate-launch-plan.md)" = "6cb588d58a60fdc7dbcd10848b186be30f9df111"
test "$(git show HEAD:docs/missions/issue-309-teammate-launch-plan.md | shasum -a 256 | cut -d ' ' -f 1)" = "52ce67014ac27466da641e79eb9dd937d5f00b39802d4366a7f4e215135b6f69"
governed_branch_before="$(git -C <governed-root> branch --show-current)"
governed_head_before="$(git -C <governed-root> rev-parse HEAD)"
git worktree add --detach <absent-mack-root> <implementation-head>
test "$(git -C <absent-mack-root> rev-parse HEAD)" = "<implementation-head>"
test "$(git -C <absent-mack-root> rev-parse HEAD^{tree})" = "<implementation-tree>"
git worktree add --detach <absent-fury-root> <implementation-head>
test "$(git -C <absent-fury-root> rev-parse HEAD)" = "<implementation-head>"
test "$(git -C <absent-fury-root> rev-parse HEAD^{tree})" = "<implementation-tree>"
node packages/shield-team-system/dist/cli.mjs mission publish-reviewed --mission-id mission:issue-311-clockwork-final-publication --base-branch <observed-default-branch> --root <governed-root> --human
node packages/shield-team-system/dist/cli.mjs mission publish-reviewed --mission-id mission:issue-311-clockwork-final-publication --base-branch <observed-default-branch> --root <governed-root> --json </dev/null
test "$(git -C <governed-root> branch --show-current)" = "$governed_branch_before"
test "$(git -C <governed-root> rev-parse HEAD)" = "$governed_head_before"
```

The predecessor checks and worktree commands prepare and prove the disposable
roots without detaching or switching the governed worktree. Between those
checks and either publication command, Hill performs this closed host
procedure:

1. Invoke the Codex custom-agent dispatch operation with registered
   `agent_type: "mack"`, `fork_context: false`, the canonical Mack root, exact
   implementation commit/tree, and this plan's validation commands.
2. Retain the host-generated dispatch receipt. Require it to bind agent type
   `mack`, `.codex/agents/mack.toml` from the implementation commit, canonical
   root, commit/tree, actual runtime/model, and host-tool executor identity.
3. Wait for terminal Mack PASS, retain Mack's independent validation artifact,
   and bind its complete-byte SHA-256 to that dispatch receipt.
4. Invoke the same host operation with registered `agent_type: "fury"`,
   `fork_context: false`, the distinct canonical Fury root, exact commit/tree,
   and Mack artifact digest for conformance review.
5. Require a distinct host-generated receipt binding agent type `fury`,
   `.codex/agents/fury.toml`, canonical Fury root, commit/tree, actual
   runtime/model, and a host-tool executor identity distinct from Mack's.
6. Wait for terminal Fury APPROVE and bind the complete terminal-packet digest
   to the Fury dispatch receipt.

A terminal message without its matching host-generated dispatch receipt is
not evidence and stops the proof. Hill validates each receipt against the
exact committed agent configuration before recording it. The second
publication invocation must return the same receipt without reading stdin or
causing an external effect. The final equality checks prove the governed
branch and HEAD remained unchanged. Hill alone writes the cumulative report;
Mack's independently returned artifact remains Mack-owned evidence.

Mack validates the exact clean implementation commit independently in a
disposable worktree and records actual command evidence. Fury then performs
exact-revision conformance review. Neither review grants human authority.

## Terminal condition

Planning ends only after Fury PASS is bound to the exact commit and SHA-256 of
this plan. Hill then prepares the real profile-aware mission and canonical
Authorize Wheels Up input with repository tooling and stops at Coulson's PIN.
No implementation, GitHub publication, merge, deployment, release, or final
acceptance is part of planning.
