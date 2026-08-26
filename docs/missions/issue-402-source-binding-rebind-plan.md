# Issue #402 — authorized issue-intake planning rebind

## Exact planning packet

- Issue: `RanSolo/shield-workspace#402`
- Planning base and implementation HEAD: `8b2be46720a9246beace0b287653bf54123e5f6f`
- Authority: `none`
- Mission: `mission:issue-intake:Liy3ctt9LcJbt5Cswk9oqX85Au-RJz5mT3EesOPKKlo`

## Observed regression

#355 receipt refresh now accepts a legitimate clean same-branch descendant
HEAD and Doctor passes, but native issue-intake planning still rejects the
authorized mission because its source binding retains the pre-plan HEAD and
receipt digest. The mission journal and Coulson authorization are valid and
must not be rewritten or repeated.

## Smallest correction

Extend the native issue-intake source-binding validator with one explicit,
authority-neutral rebind path. It may update the in-memory replay comparison
only when the repository is the same registered repository, the branch is the
same branch, the worktree is clean, the current HEAD is a descendant of the
bound HEAD, the refreshed #355 preparation receipt is valid, and the exact
intervening commit set is a validated mission-local authority-none planning
commit for this mission. Freeze the accepted planning tip and exact ordered
commit range in the transition binding, from the bound planning base through
the parent plan commit; reject missing, extra, reordered, merged, squashed,
malformed, or ambiguous commits rather than inferring eligibility from paths
or commit messages. The validator must preserve the journal bytes,
authorization evidence, predecessor source binding, and dispatch evidence;
replay must be idempotent and no new authority may result.

The active refreshed #355 receipt and its complete validated predecessor
archive chain are also immutable inputs: rebind must preserve their bytes and
filesystem identities, must not refresh or replace a receipt, and must prove
that exact replay performs no receipt write.

All branch changes, non-descendants, dirty state, policy or registry drift,
issue/criteria drift, unrelated commits, malformed plans, and ambiguous
provenance remain fail-closed. Do not broaden #401 semantics or create a Fury
successor.

## Approved paths and evidence

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `docs/missions/issue-402-source-binding-rebind-plan.md`
- `docs/missions/issue-402-transition-plan.json`

Tests cover one valid same-mission planning rebind, exact replay, byte/identity
preservation of journal, authorization, active receipt, and predecessor
archive chain (including no receipt write on replay), and rejection of branch,
dirty, non-descendant, policy, issue, unrelated-commit, and malformed-plan
drift.

Validation command identities are frozen in the transition artifact; no
validation is claimed at planning time.

## Exclusions

No #401 implementation, journal rewrite, authority grant, Fury successor,
publication, merge, deployment, release, or final acceptance.
