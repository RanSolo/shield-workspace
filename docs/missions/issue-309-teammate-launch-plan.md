# Issue #309 — exact-revision teammate-launch plan

## Frozen identity

- Repository: `RanSolo/shield-workspace`
- Issue: `#309 — Make teammate trial launch exact-revision and repository-local`
- Planning base: `79243ee673aecc7506addbd2ee6372dd510e7e7e`
- Branch: `agent/issue-309-teammate-launch`
- Objective: provide one deterministic command that prepares an isolated
  teammate-trial checkout at an explicitly supplied reviewed revision, proves
  its bootstrap identity, builds and invokes that checkout's repository-local
  SHIELD CLI, and returns one visible VS Code open action only after the
  authority-neutral preflight reaches `ready_for_host_confirmation`.
- Authority: planning only. Implementation requires exact-plan Fury review and
  Coulson Wheels Up. This mission does not run the Issue #307 interaction.

## Failure evidence and existing seam

The first Issue #307 setup attempt failed closed before any exercise effect:

- the VS Code Agents flow created an isolated checkout at current main
  `79243ee673aecc7506addbd2ee6372dd510e7e7e`, not reviewed Issue #307 HEAD
  `fe4c751cd9299e740b3638c590da345ca315059d`;
- that checkout lacked the exact #307 bootstrap and prompt;
- fresh Hill searched history instead of receiving the reviewed packet; and
- the documented `shield teammate preflight` command was not globally
  installed.

The existing preflight evaluator is not defective. It already requires a
40-character expected HEAD, checks cleanliness and tracked declarations,
classifies a fresh checkout as `uninitialized_worktree`, and retains authority
`none`. The missing boundary is the deterministic host-side launcher before
that evaluator.

No stable repository API was found for programmatically creating a Codex
Agents-window thread at an exact Git object. This slice therefore prepares and
proves the workspace, then emits the exact visible open action and prompt path.
It does not automate or claim host UI state.

## Closed repository-local command

Run from the source checkout whose tracked launcher bytes are visible:

```text
npm run teammate:launch -- \
  --root <absolute-new-empty-directory> \
  --expected-head <40-lowercase-hex> \
  --bootstrap <normalized-repository-relative-json-path> \
  --bootstrap-sha256 <64-lowercase-hex> \
  [--json]
```

The package script executes tracked `tools/teammate-launch.mjs` directly with
`process.execPath`. The dependency-free launcher uses only Node built-ins
until the target exists. Its source/object repository is derived from its own
canonical location; there is no caller-selected source root, source `dist`, or
source CLI ambiguity. It never resolves PATH `shield` or `nx`, searches for
another package copy, or embeds an operator-specific path.

Input is closed. The destination must be an absent path under one existing,
writable, canonical, non-symlink parent. Home, source/workspace root, reused,
aliased, broad, or non-empty destinations fail closed. The bootstrap path must
be normalized, relative, confined, non-empty, and name a regular tracked blob.

## Closed state machine

The operation contract is `shield.teammate-launch.v1`, authority `none`:

- `ready_for_host_confirmation` — target and artifacts are proven and the
  target-local preflight passed;
- `action_required` — deterministic pre-effect or reconciled preparation
  failure; or
- `recovery_required` — a process/filesystem boundary is uncertain or exact
  post-state cannot be proven.

Exact ordered steps:

1. Parse and validate the closed input without mutation.
2. Resolve the canonical source from the launcher's own path, destination
   parent/root, deterministic adjacent receipt path
   `<root>.shield-teammate-launch-v1.json`, and expected commit using fixed
   Git arguments. Retain the destination-parent device/inode identity and
   require both destination and receipt absent before mutation. Every Git call
   uses a closed environment, ignores system/global configuration, disables
   hooks and external fsmonitor, and supplies fixed safe configuration. Before
   mutation, reject tracked `.gitattributes` checkout filter/process
   declarations; no caller or repository-local checkout driver is executed.
3. Before mutation, validate all three bound artifacts from Git object bytes.
   Use fixed `git ls-tree` and `git cat-file blob` calls to require regular
   tracked bootstrap, reviewed-plan, and derived-prompt blobs. Parse the
   bootstrap with exact top-level and nested key sets; reject unknown fields.
   Validate every `shield.teammate-demo-bootstrap.v1` field, exact ordered
   `goEvidenceMustBind`, supplied bootstrap SHA-256, plan
   path/commit/type/SHA-256, plan-commit ancestry to expected HEAD, derived
   prompt path/type, and prompt SHA-256.
4. Create the target with fixed arguments
   `git worktree add --detach <root> <expected-head>`. No shell, branch
   inference, `main` checkout, clone, fetch, or network access is permitted.
5. Re-read canonical target root, detached state, HEAD, tracked inventory,
   porcelain status, `.shield` absence, and all three artifact bytes/digests.
   Require Team System and dependency build outputs absent. Mismatch stops
   before dependency installation.
6. Run fixed `npm ci --include=dev --ignore-scripts --no-audit --no-fund`.
   After proven normal exit, repeat step 5 and validate the complete
   ignored/untracked inventory; only lockfile-defined dependency output is
   admitted.
7. Validate the pinned Nx file and version against `package-lock.json`, then
   invoke `node_modules/nx/dist/bin/nx.js` through
   `process.execPath` for exact `@shield/team-system:build`, with daemon and
   cloud disabled and freshly created empty isolated cache/workspace-data
   directories. Before build, verify the exact two-task graph and dependency
   edge: `@shield/mission-preparation:build` precedes
   `@shield/team-system:build`. After proven normal exit, repeat repository
   checks with a phase-specific inventory allowlist admitting only lockfile
   dependencies, those two generated `dist` roots, and the exact isolated Nx
   state directories.
8. Validate complete generated `dist` manifests for both Mission Preparation
   and Team System. Every path is confined; every ancestor and leaf is
   non-symlink; every leaf is regular; the expected CLI and imported Mission
   Preparation runtime exist; and each sorted
   path/mode/size/content-digest manifest has one retained digest.
9. Invoke the target CLI through `process.execPath`:

   ```text
   packages/shield-team-system/dist/cli.mjs teammate preflight \
     --root <root> --expected-head <expected-head> --json
   ```

   Parse the closed report and require exact schema, authority `none`,
   expected HEAD, disposition `ready_for_host_confirmation`, and observed
   worktree state `uninitialized_worktree`.
10. Re-read HEAD, detached state, tracked/ignored inventories, porcelain,
    `.shield` absence, all artifacts, both unchanged `dist` manifest digests,
    destination-parent identity, and receipt absence. Any uncertainty or drift
    is `recovery_required`.
11. Atomically persist one adjacent sidecar receipt outside the target using
    exclusive temporary creation, file flush, a no-replace publication
    protocol using an exclusive reservation/lock and atomic hard-link, temporary
    unlink, parent-directory flush, and exact readback. Plain replacing rename
    is forbidden. The closed receipt has a content digest over all non-digest
    fields. Collision, changed parent identity, or uncertain durability is
    `recovery_required`. Replay is outside this slice.
12. Return exact identities and this visible next action:

    ```text
    code --new-window <verified-root>
    ```

    The launcher never executes `code --new-window`. The composed existing
    preflight may execute its fixed read-only `code --version`,
    `code --list-extensions --show-versions`, and `codex --version` probes;
    those remain explicit permitted executables and reconciled child-process
    boundaries. Opening the workspace, selecting Agents, and pasting the
    verified prompt remain operator-observed host confirmations.

The launcher never calls `shield worktree prepare`, copies `.shield`, creates
a mission or journal, requests a PIN, invokes a model, contacts GitHub,
publishes, merges, deploys, or releases.

## Bootstrap and receipt binding

For `shield.teammate-demo-bootstrap.v1`, require:

- schema `1`, authority `none`, and positive integer issue ID;
- reviewed plan path, 40-hex plan commit, and 64-hex plan digest;
- required machine/worktree/terminal dispositions; and
- exact `goEvidenceMustBind`, including `bootstrapSha256` and
  `liveBootstrapCheckoutHead`.

The plan commit must be an ancestor of expected HEAD. The prompt path is exactly
`.codex/prompts/issue-<issueId>-teammate-demo.md`. The local receipt binds
repository identity, expected/observed HEAD, bootstrap/plan/prompt
paths/digests, target package/CLI and `dist` manifest identities, preflight
report digest, and receipt identity. It contains no authority, trust,
credentials, journal, signer data, transcript, executable path, or model claim.
The publication-safe JSON projection replaces roots with `<SOURCE_ROOT>` and
`<DISPOSABLE_ROOT>`; raw process output is never published.

## Failure and process reconciliation

First match wins:

1. `invalid_input`
2. `source_unavailable`
3. `revision_unavailable`
4. `bootstrap_missing`
5. `bootstrap_mismatch`
6. `destination_unsafe`
7. `worktree_create_failed`
8. `checkout_mismatch`
9. `dependencies_unavailable`
10. `build_unavailable`
11. `cli_unavailable`
12. `preflight_not_ready`
13. `repository_drift`
14. `receipt_write_failed`
15. `recovery_required`

Each failure has one concise next action. `worktree_create_failed` is allowed
only when both destination and common-directory registration are proven absent
using `git worktree list --porcelain`. Normal nonzero child exit is actionable
only after proven termination and exact state readback. Timeout, signal, output
overflow, unknown termination, uncertain durability, or inability to prove
post-state is `recovery_required`. No automatic cleanup occurs.

Existing targets and sidecars are always rejected. This slice intentionally
does not implement replay, resume, cleanup, or window opening.

## Acceptance lanes

### Lane A — launcher core (ACs 1, 2, 3, 5, 6, 8)

- Closed input/state machine, pre-mutation artifact checks, detached worktree,
  target setup, preflight composition, drift checks, durable sidecar, and
  reconciliation.
- Inject process/filesystem adapters for faults; production accepts no caller
  assertions of success, readiness, authority, or identity.

### Lane B — repository-local entrypoint (ACs 4 and 6)

- Root dependency-free `npm run teammate:launch -- ...` entrypoint.
- Pinned target Nx and target CLI only; no package export or consumer API.
- Preserve existing `shield teammate preflight` and package consumers.

### Lane C — regression and operator proof (ACs 5, 6, and 7)

- Wrong-main, missing global `shield`, absent dependencies, install/build
  failure, stale/malformed bootstrap, plan/prompt mismatch, dirty target,
  hidden `.shield`, stale source `dist`, PATH `nx` substitution,
  interrupted worktree registration, partial receipt durability, and process
  uncertainty.
- Put decoy `shield` and `nx` on PATH and prove neither is invoked.
- Add one real-process disposable positive proof reaching only
  `ready_for_host_confirmation` with `uninitialized_worktree`.
- Never open Agents or run Issue #307.

## May write scope

- `tools/teammate-launch.mjs`
- `tools/teammate-launch.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `package.json`
- `docs/operations/vscode-agents-teammate-trial.md`

This reviewed plan is immutable and excluded from May's write scope. No new Nx
project is justified: this is a dependency-free repository operator tool that
invokes the existing `@shield/team-system` build and preflight, not a new
product/package boundary.

## Validation and terminal condition

- launcher tests through a dedicated root
  `npm run test:teammate-launch` script;
- package-surface tests through the Team System Nx target;
- `npm exec nx -- run @shield/team-system:build --skipNxCache`;
- `npm exec nx -- run @shield/team-system:test --skipNxCache`;
- target-local CLI startup and complete Team System/Mission Preparation
  `dist` manifest proof;
- real disposable exact-revision positive proof with global `shield` absent;
- wrong-main/bootstrap negative controls proving no open action is emitted;
- `git diff --check`; and
- clean exact implementation HEAD before Mack/Fury review.

The mission ends with one bounded draft PR and exact-revision Mack/Fury
evidence. It excludes Issue #307 interaction, host confirmations, GO
disposition, human acceptance, merge, deployment, and release.
