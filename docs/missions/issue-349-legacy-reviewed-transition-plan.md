# Issue #349 — legacy reviewed-plan continuation

## Exact identity

- Parent proving loop: #341
- Repository: `RanSolo/shield-workspace`
- Planning base: `753256e44d8601162becafcc1f8251345d352b65`
- Branch: `agent/issue-349-legacy-bridge`
- Mission: `mission:issue-349-legacy-plan-bridge`
- Authority at freeze: planning only

## Problem

A cold Hill can replay an authorized legacy schema-9 mission, but its historical
reviewed plan is a committed Markdown file rather than a
`mission.transition-plan.v1|v2` artifact. The current authority-none
`mission prepare-reviewed-transition` compositor correctly refuses to create
protected review evidence without a structured plan; `mission prepare-next`
then returns `protected_evidence_mismatch`.

## Bounded outcome

Add one authority-none continuation command:

```text
shield mission continue-legacy-reviewed-transition \
  --mission-id <id> \
  --fury-model <model-id> \
  --root <canonical-root> \
  --json
```

The command derives a closed structured transition-plan candidate in memory
from canonical repository, prepared-worktree, mission journal, implementation
authority, runtime binding, publication authority, and one eligible committed
legacy-plan file. It routes that candidate through the existing reviewed-
transition compositor. It accepts no caller-supplied plan path, transition
kind, scope, verdict, receipt, review path, runtime identity, or authority.

Markdown is identity evidence only. Its content is never parsed into scope,
authority, acceptance criteria, or a Fury verdict.

## Eligibility and derivation

Before a model call, audit write, or journal effect, require all of the
following:

1. The explicit root is an exact prepared worktree of the configured
   repository, on an attached clean branch and exact current HEAD.
2. The mission is nonterminal, authorized, not executed, and has exactly one
   active implementation authority and matching active runtime binding.
3. The authority, binding, publication authority, journal, subject,
   repository, branch, base, artifact revision, and approved paths agree.
4. Exactly one regular `docs/missions/*.md` legacy-plan path is within the
   authority's approved paths, changed in the authority base-to-artifact range,
   and resolves to one immutable Git blob at the authority artifact revision.
5. The transition candidate is built only with the existing mission-transition
   builder, uses the observed immutable legacy-plan path/blob digest as parent
   identity, and has host-owned exclusions for authority transfer, publication
   expansion, merge, deployment, release, destructive effects, and final
   acceptance.

Zero or multiple candidates, substitution, dirty state, unsupported lineage,
or any identity mismatch returns one closed actionable result before dispatch.

## Composition and replay

- Keep the existing committed-file `prepare-reviewed-transition` entrypoint
  unchanged.
- Add an internal derived-source carrier used only by the legacy continuation
  and reviewed-transition host. It binds canonical candidate bytes/raw digest
  plus full provenance into a host-derived virtual path; no virtual artifact is
  written or treated as a repository plan file.
- Persist/replay one create-once derivation seed keyed by canonical repository
  workspace, mission ID, and mission revision. Revalidate all mutable identity
  before dispatch and materialization.
- Pass only the returned receipt-bound PASS handoff to the existing
  materializer. `prepare-next` remains a graph-only consumer.
- Exact retry reuses the seed and never invokes Fury twice. Any identity drift
  conflicts or requires recovery before a second effect.

## Allowed paths

- `packages/shield-team-system/src/legacy-reviewed-transition-v1.mts`
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`
- `packages/shield-team-system/src/copilot-fury-reviewed-transition-host-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/agents/maria-hill-orchestrator.agent.md`
- `packages/shield-team-system/playbooks/delivery-mode.md`
- `packages/shield-team-system/tests/delivery-mode.test.mjs`
- this plan

No public package export, dependency, lockfile, mission/authority schema,
journal, signer, binding, publication schema, GitHub adapter, merge,
deployment, release, or final-acceptance change is permitted.

## Acceptance evidence

1. A positive exact legacy fixture reaches the reviewed-transition compositor
   without caller-authored protected evidence and advances beyond the former
   `protected_evidence_mismatch` result.
2. Missing, ambiguous, untracked, stale, substituted, linked, changed, or
   unsupported legacy-plan candidates fail before a Fury dispatch.
3. Candidate bytes, raw digest, source kind, and full derivation provenance are
   bound through seed, dispatch, returned handoff, and materialization.
4. Public committed-plan behavior remains byte-compatible and cannot select the
   derived source.
5. Exact replay yields one model effect; drift in mission, journal, branch,
   head, authority, binding, plan blob, or reviewer model fails closed.
6. A fresh Hill can discover the continuation command and invoke it before
   `prepare-next`, with no additional Coulson PIN.
7. Focused tests plus cache-enabled Nx affected validation exclude Multiband.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- focused legacy, dispatcher, reviewed-transition, supervised-CLI, and
  delivery-mode tests
- `npm exec -- nx affected -t build test --base=753256e44d8601162becafcc1f8251345d352b65 --head=HEAD --exclude=@shield/multiband`
- `git diff --check 753256e44d8601162becafcc1f8251345d352b65..HEAD`

## Stop conditions

Stop before implementation if the design requires Markdown interpretation,
caller-supplied authority or review evidence, a transferred worktree state, a
second dispatcher/materializer, a public contract change, or any excluded
effect.
