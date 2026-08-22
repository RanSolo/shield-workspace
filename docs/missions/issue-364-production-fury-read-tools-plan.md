# Issue #364 — production Fury exact-read tool plan

## Exact planning context

- Issue: `#364`
- Parent rail loop: `#341`
- Follow-ups: `#319`, `#353`
- Stacked planning base and HEAD: `cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-364-fury-tools`
- Authority while planning: `none`

## Proven defect

The production Copilot Fury executor registers host handlers named `read` and `search`, but its session also excludes `custom:*`. Copilot SDK 1.0.11 gives `excludedTools` precedence, so the registered handlers are unavailable even though `availableTools` advertises them. The executor also reads only the exact HEAD tree, while a legacy-derived transition plan is a virtual content-addressed artifact and the parent plan is bound to `parentPlanCommit`, which need not equal HEAD.

The exact #353 production receipt `receipt:2HhV3d8FZ1lmCS7ilc2JcVLXJkzLAKtj` therefore ended in `PLAN_BINDING_INVALID`; exact retry replayed that terminal receipt without reinvocation.

## Bounded outcome

Make production Fury's two advertised tools genuinely available and immutable. `read` and `search` operate over one host-frozen review snapshot containing the exact transition-plan bytes, pinned parent-plan bytes, and permitted exact-HEAD tree entries. No model-supplied revision, filesystem write, shell, network, MCP, plugin, skill, Git mutation, or authority effect is admitted.

## Implementation contract

1. Replace the contradictory blanket custom-tool exclusion with a closed session filter that admits only the host-registered `read` and `search` tools while preserving every existing mutating/network/tool exclusion.
2. Extend the executor run input with an immutable, prevalidated review-artifact projection assembled before model execution:
   - transition-plan logical path, exact bytes, raw SHA-256, and source identity;
   - parent-plan logical path, exact bytes from `parentPlanCommit`, raw SHA-256, and pinned commit identity.
3. Construct that projection in the dispatch core from the already validated transition-plan source and exact Git object reads. Reject missing blobs, hash mismatch, path collision with conflicting bytes, malformed UTF-8/size, or any preclaim/revalidation drift before invoking Copilot.
4. Make `read` resolve bound artifacts first and otherwise use the exact HEAD tree. Make `search` deterministically include the same bound artifacts plus the exact HEAD tree without duplicate logical paths.
5. Never accept a revision from Fury. Tool arguments remain the closed existing path/query schema; `.git`, traversal, symlink-like escape, unbound commits, and unbounded scans fail closed.
6. Record the concrete installed tool identities/source qualification in executor observations/evidence so `availableTools` cannot claim a capability that session filtering removed.
7. Add a pre-invocation readiness assertion proving both required handlers survive the final SDK tool filter. Missing/unusable registration returns an actionable adapter/tool-binding failure without spending a Fury model call.
8. Preserve packet, receipt, V1/V2 replay, phase, repair, card-precedence, and execute-once semantics byte-for-byte unless a versioned evidence field is explicitly required by the reviewed design.

## Acceptance matrix

- Production-faithful SDK session invokes both host handlers.
- `read(transitionPlanPath)` returns exact legacy-derived bytes.
- `read(parentPlanPath)` returns bytes from `parentPlanCommit` when HEAD contains different bytes.
- Committed transition-plan dispatch still reads the exact committed blob.
- Search includes bound virtual/pinned artifacts exactly once and remains deterministic.
- Unknown custom tools, built-in writes, shell, web, MCP, plugins, skills, arbitrary revisions, `.git`, traversal, oversized input, and out-of-root paths are denied.
- Tool-registration/filter mismatch fails before claim/model invocation and creates no terminal fiction.
- Exact replay invokes no SDK/model/tool again and preserves receipt/evidence identity.
- The preserved #353 packet can advance from its reviewed-transition checkpoint to a durable Fury handoff.
- Nx focused/affected validation uses normal cache and excludes `@shield/multiband`.

## Smallest authorized path set

- `docs/missions/issue-364-production-fury-read-tools-plan.md`
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Validation

- `npm exec nx run @shield/team-system:build`
- `npm exec nx run @shield/team-system:test:copilot-fury-plan-dispatch`
- focused host/package/CLI tests through existing Nx targets or `nx exec`
- `npm exec nx affected -t build test --base=cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc --head=<exact-candidate-sha> --exclude=@shield/multiband --nxBail`
- `git diff --check cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc..<exact-candidate-sha>`

## Exclusions

- Fury writes or edits
- shell/process, Git, web, MCP, plugin, skill, or arbitrary filesystem access
- publication, merge, deployment, release, or final acceptance
- changing #353 phase semantics
- generic SDK/tool framework refactoring beyond the exact production adapter seam
