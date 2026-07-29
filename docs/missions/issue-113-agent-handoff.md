# Issue #113 — Exact-Scope Review Publication Handoff

## Mission binding

- Repository: `RanSolo/shield-workspace`
- Branch: `codex/issue-113-review-publish-scope`
- Base revision: `1316f317fe9aaf6de4a94a5055f7104282e2779b`
- Subject: `issue:113`
- Authority: bounded implementation and draft-review publication; no merge,
  deployment, release, or scope expansion
- Human stop gate: Fitz technical review

## Specialist record

### Daisy reconnaissance

- Runtime: local `ornith-1.0-35b`
- Executor: repository-local LM Studio harness
- Result: identified that the existing generic permission contract did not
  enforce an exact review-publication path boundary.
- Artifact: `/tmp/daisy-issue-113-recon.md` on the executing host; the raw
  artifact is not repository evidence.

### May implementation attempt

- Runtime: local `ornith-1.0-35b`
- Executor: repository-local LM Studio harness
- Result: rejected as unusable. The response supplied a summary rather than an
  applyable patch and invented validation commands. It produced no repository
  changes.
- Artifact: `/tmp/may-issue-113-core.patch` on the executing host; the raw
  artifact is not repository evidence.

### Fury architecture gate

- Runtime: `gpt-5.6-sol`
- Executor: Codex subagent
- Base revision reviewed:
  `1316f317fe9aaf6de4a94a5055f7104282e2779b`
- Start verdict: PASS for an additive host-neutral
  `review-publication.v1` contract, publication-bound adapter v2 records, and
  GitHub pre-effect observation. Historical adapter v1/journal behavior remains
  replayable but cannot authorize a new live publication.
- Final exact-head verdict: pending after implementation commit.

## Implemented boundary

- A closed authority binds authority kind, mission, subject, mission revision,
  repository, canonical root, branch, base/head revisions, exact paths, and
  permitted effects.
- A trusted Coulson binding signs the exact authority digest into an append-only
  v8 `review.publication_authorized` record. Caller-supplied authority is not
  accepted.
- A proposal binds proposed and observed base-to-head paths, requested effects,
  symlink/gitlink observations, and workspace cleanliness.
- Exact path equality is required. Unsafe, sensitive, ambiguous, duplicate,
  missing, extra, symlink, gitlink, dirty, stale, or mismatched inputs fail
  closed.
- `review.publish` and Wheels Up use the same exact-scope evaluator; Wheels Up
  does not widen paths or effects.
- Both GitHub publication entry points load and fully replay the durable journal
  before branch push, draft-PR create/update, or review-comment publication.
- Review comments exact-match the journaled PR target. Draft-PR publication
  exact-matches repository, mission branch, base branch, and the host-observed
  remote base revision before effect.
- Supervised journal v8 carries the signed authorization, publication-bound
  adapter v2 request, and result evidence bound to that exact request and
  scope, operation, and target. Delivery Workspace also returns journal-ready
  result candidates for successful and post-scope failed attempts. Earlier
  journals retain their historical meaning.

## Validation contract

Required before the Fury exact-head review:

1. TypeScript build.
2. Pure exact-scope positive and negative tests, including the allowed
   two-artifact case and unauthorized third/code paths.
3. Journal v8 compatibility and adapter-version tests.
4. GitHub adapter, PR workspace, and Delivery Workspace pre-effect tests.
5. Full package test suite and package-surface consumer validation.
6. `git diff --check`, changed-path verification, and clean committed head.

## Next gate

After validation, commit and publish a draft PR, obtain Fury's verdict against
that exact commit, and stop for Fitz human technical review. Do not merge.
