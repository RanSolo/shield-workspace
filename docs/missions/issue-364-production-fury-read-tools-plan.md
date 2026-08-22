# Issue #364 — production Fury exact-read tool plan

## Exact planning context

- Issue: `#364`
- Parent rail loop: `#341`
- Follow-ups: `#319`, `#353`
- Stacked implementation base / pre-plan HEAD: `cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc`
- Exact initial plan-review HEAD: `d5d88ca1f009688a10b54349367ab64a84dddd0a`
- Initial plan SHA-256: `44e4717e730e59a88ce6af6c4819af241897f3d729bf86e91221de837e607bc4`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-364-fury-tools`
- Authority while planning: `none`

## Proven defect

The production Copilot Fury executor registers host handlers named `read` and `search`, but its session also excludes `custom:*`. Copilot SDK 1.0.11 gives `excludedTools` precedence, so the registered handlers are unavailable even though `availableTools` advertises them. The executor also reads only the exact HEAD tree, while a legacy-derived transition plan is a virtual content-addressed artifact and the parent plan is bound to `parentPlanCommit`, which need not equal HEAD.

The exact #353 production receipt `receipt:2HhV3d8FZ1lmCS7ilc2JcVLXJkzLAKtj` therefore ended in `PLAN_BINDING_INVALID`; exact retry replayed that terminal receipt without reinvocation.

## Bounded outcome

Make production Fury's two advertised tools genuinely available and immutable. `read` and `search` operate over one host-frozen review snapshot containing the exact transition-plan bytes, pinned parent-plan bytes, and permitted exact-HEAD tree entries. No model-supplied revision, filesystem write, shell, network, MCP, plugin, skill, Git mutation, or authority effect is admitted.

## Implementation contract

1. Preserve the existing logical packet `sdkConfiguration` byte-for-byte for historical packet/receipt replay. Add a distinct versioned execution-only runtime tool-binding projection with:
   - session `availableTools: ["custom:read", "custom:search"]`;
   - no exclusion matching either qualified identity;
   - `builtin:*` and `mcp:*` denied plus explicit custom mutator/network exclusions;
   - custom-agent `tools: ["read", "search"]`, because that field uses bare names;
   - exactly two unique registered descriptors named `read` and `search`.
2. Extend executor preflight/run inputs with an immutable, prevalidated review-artifact projection assembled before any claim or model execution:
   - transition-plan logical path, exact bytes, raw SHA-256, and source identity;
   - parent-plan logical path, exact bytes from `parentPlanCommit`, raw SHA-256, pinned commit, exact `ls-tree` mode/object ID, and `cat-file` identity.
3. Freeze the projection as a canonical map keyed by normalized logical path. Each entry contains exact bytes, raw SHA-256, one or both roles (`transition_plan`, `parent_plan`), and all source identities. Conflicting bytes at one path fail preclaim; identical bytes deduplicate while retaining both roles/bindings; a bound entry shadows an exact-HEAD entry at the same path.
4. Construct and digest that map in the dispatch core from the already validated transition-plan source and exact Git object reads. Reject missing/non-blob objects, hash mismatch, malformed UTF-8/size, collision conflict, or drift. Revalidate its canonical digest at the existing before-claim and terminal live-binding gates.
5. Make `read` resolve bound artifacts first and otherwise use only otherwise-unbound regular UTF-8 blobs from the exact HEAD tree. Make `search` iterate unique normalized paths in bytewise order and then ascending line number, applying the existing byte cap before the result cap deterministically.
6. Add two explicit readiness gates:
   - preclaim structural validation of pinned SDK version, exact descriptor registry, qualified filters, closed schemas, and artifact-map digest; failure returns stable `FURY_TOOL_BINDING_INVALID` with zero claim, client construction/start, session creation, or model call;
   - postclaim/pre-model validation through SDK 1.0.11 `session.rpc.tools.initializeAndValidate()` and `getCurrentMetadata()`, requiring the model-facing set to be exactly `read` and `search` before `sendAndWait`; disagreement terminalizes as `FURY_TOOL_BINDING_DRIFT`.
7. Never accept a revision from Fury. Tool arguments remain the closed existing path/query schema; `.git`, traversal, symlink-like escape, unbound commits, and unbounded scans fail closed.
8. Record the concrete installed tool identities/source qualification in a versioned execution observation/evidence projection. Historical observations replay without reinterpretation.
9. Preserve logical packet configuration, packet/receipt bytes, V1/V2 replay, phase, repair, card-precedence, and execute-once semantics. The terminal #353 receipt remains immutable and must replay unchanged; proving advancement uses a fresh operation at the corrected exact HEAD and a new packet/receipt.

## Acceptance matrix

- Production-faithful SDK session invokes both host handlers.
- `read(transitionPlanPath)` returns exact legacy-derived bytes.
- `read(parentPlanPath)` returns bytes from `parentPlanCommit` when HEAD contains different bytes.
- Committed transition-plan dispatch still reads the exact committed blob.
- Search includes bound virtual/pinned artifacts exactly once and remains deterministic.
- Unknown custom tools, built-in writes, shell, web, MCP, plugins, skills, arbitrary revisions, `.git`, traversal, oversized input, and out-of-root paths are denied.
- Tool-registration/filter mismatch fails before claim/model invocation and creates no terminal fiction.
- Runtime metadata disagreement occurs after claim but before model invocation and records a truthful terminal binding-drift result.
- Exact replay invokes no SDK/model/tool again and preserves receipt/evidence identity.
- The preserved terminal #353 packet continues to replay unchanged; a fresh corrected-HEAD proving operation advances to a durable Fury handoff.
- Nx focused/affected validation uses normal cache and excludes `@shield/multiband`.

## Smallest authorized path set

- `docs/missions/issue-364-production-fury-read-tools-plan.md`
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- `packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Validation

- `npm exec nx run @shield/team-system:build`
- `npm exec nx run @shield/team-system:test:copilot-fury-plan-dispatch`
- `npm exec nx exec --project=@shield/team-system -- node --test packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs packages/shield-team-system/tests/package-surface.test.mjs packages/shield-team-system/tests/supervised-cli.test.mjs`
- The focused fixtures must exercise SDK 1.0.11 `initializeAndValidate()`/`getCurrentMetadata()` with the exact production-built registry, source-qualified filter survival, missing/duplicate handler preclaim with zero effects, virtual/pinned/committed reads, equal/conflicting collisions, deterministic search/truncation, and historical no-invocation replay.
- `npm exec nx affected -t build test --base=cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc --head=<exact-candidate-sha> --exclude=@shield/multiband --nxBail`
- `git diff --check cbeb2c50ae92637fcd1dc3fd7fd0ce7b9d4e89fc..<exact-candidate-sha>`

## Exclusions

- Fury writes or edits
- shell/process, Git, web, MCP, plugin, skill, or arbitrary filesystem access
- publication, merge, deployment, release, or final acceptance
- changing #353 phase semantics
- generic SDK/tool framework refactoring beyond the exact production adapter seam
