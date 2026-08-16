# Issue #306 — VS Code Agents teammate-readiness plan

## Frozen identity

- Repository: `RanSolo/shield-workspace`
- Issue: `#306`
- Planning base and initial HEAD: `92d7f90`
- Branch: `agent/issue-306-vscode-teammate-readiness`
- Objective: prepare one safe, repeatable teammate trial through the VS Code
  Agents window without transferring Coulson's chat history, local mission
  state, signer material, or passcodes.
- Authority: planning only. Implementation requires exact-plan Fury review and
  Coulson Wheels Up.

## Repository evidence

- `.codex/config.toml` already declares exactly the five canonical seats and
  points to tracked seat cards. Repository bytes prove only those declarations;
  they do not prove that a VS Code/Codex host loaded, rendered, or applied them.
  No in-repository VS Code transport adapter exists or is required for the first
  trial.
- `AGENTS.md` already supplies the repository-wide routing and run-silent
  contract.
- `shield worktree prepare` and `shield doctor` already prepare and classify
  SHIELD policy, but `prepare` intentionally copies public configuration and
  trusted-binding records from another governed worktree. The teammate flow
  must not use that seam because no cross-person binding transfer is authorized.
- The current tracked tree still contains two historical files under
  `.shield/journals/`. A fresh clone therefore receives personal mission
  history despite `.shield/` now being ignored.
- The currently observed host tuple is VS Code `1.133.0`, build
  `a5b500951314efd502d07465bd138dfbd714a960`, architecture `arm64`, OpenAI
  extension `openai.chatgpt@26.810.41047`, and Codex CLI
  `0.147.0-alpha.6.5` from extension directory `26.803.61601`. These are distinct
  trial observations, not proof that the active extension uses the PATH CLI and
  not a permanent compatibility promise.
- Seat-specific MCP requirements are not declared in `.codex`; seats inherit
  the host's available capabilities. The trial must not claim that an MCP is
  available merely because a repository file exists.

## Design

### 1. Authority-neutral teammate preflight

Add one read-only command:

```text
shield teammate preflight --root /absolute/repository/root \
  --expected-head 40_LOWERCASE_HEX [--json]
```

The command observes only fixed local facts and returns a closed report. It
must not initialize SHIELD, copy policy, create a mission, request a PIN,
invoke a model, contact GitHub, or mutate the repository.

The command captures branch, HEAD, porcelain-v1 status, root identity, and
tracked-file inventory before any other probe, then repeats every observation
afterward. Any change returns `action_required` with reason
`repository_drift`. `--expected-head` is mandatory and mismatch fails before
host probes.

Repository declarations are read as exact blobs from `--expected-head`, never
from mutable working-tree bytes. The report binds:

- repository root, branch, exact HEAD, and cleanliness;
- installed Team System package version;
- observed VS Code version/build/architecture, OpenAI extension
  identifier/version, and Codex CLI version/path, including stable
  `unavailable`, `malformed`, and `timeout` classifications;
- tracked presence of `AGENTS.md`, `.codex/config.toml`, and exactly the five
  canonical seat-card paths;
- the canonical seat names, declared model IDs, reasoning efforts, and sandbox
  modes projected from the tracked repository files, each labeled `declared`;
- an exact empty tracked `.shield` inventory;
- `shield doctor`/worktree-state classification without reinterpreting its
  authority-neutral result;
- host-confirmation items that cannot be proven from repository bytes,
  including Agents-window rendering, account model entitlement, inherited MCP
  availability, and successful agent creation.

The closed JSON contract is `shield.teammate-readiness.v1`, with `authority:
"none"`, top-level disposition exactly
`ready_for_host_confirmation | action_required`, and every host-confirmation
item exactly `unverified`. Repository declarations are never labeled `loaded`
or `verified`. Every failed machine check has one actionable next step. JSON is
complete and stable; human output is concise. Exit codes are exactly zero for
`ready_for_host_confirmation`, one for `action_required`, and two for usage or
closed-input errors.

Machine checks are emitted in this exact order. Each check contains only its
fixed ID, `pass | fail | observed` status, closed reason code, and the stated
single next action:

| ID | Pass criterion | Failure reason / next action | Gating |
| --- | --- | --- | --- |
| `input.closed` | CLI input is closed and `--expected-head` is one 40-hex object ID | `invalid_input` / correct the invocation | yes; exit 2 |
| `repository.root` | root resolves once to an accessible Git worktree | `repository_unavailable` / select the disposable clone root | yes |
| `repository.expected_head` | initial HEAD equals `--expected-head` | `expected_head_mismatch` / checkout the expected revision | yes |
| `repository.clean` | initial porcelain-v1 status is empty | `workspace_dirty` / inspect and preserve or remove unexpected state | yes |
| `repository.declarations` | expected-commit blobs contain AGENTS, config, and exactly five valid canonical seat cards | `declaration_invalid` / repair the tracked declarations | yes |
| `repository.tracked_shield` | expected-commit `.shield` inventory is exactly empty | `tracked_state_present` / remove tracked runtime state | yes |
| `package.team_system` | installed package identity/version is available and matches the workspace declaration | `package_unavailable` / install the exact lockfile and rebuild | yes |
| `host.vscode` | fixed no-shell probe returns a well-formed VS Code version/build/architecture tuple | `host_probe_failed` / repair or select the intended VS Code host | yes |
| `host.openai_extension` | fixed no-shell probe finds exactly one well-formed OpenAI extension identity/version | `host_probe_failed` / install or repair the intended extension | yes |
| `host.codex_cli` | fixed no-shell probe returns a well-formed Codex CLI classification/version; absolute executable path is local-only | `host_probe_failed` / repair the intended CLI installation | yes |
| `shield.worktree_state` | doctor classifies the fresh clone as `uninitialized_worktree` | `unexpected_policy_state` or `malformed_policy_state` / remove copied policy or recreate the clone | observed only for `uninitialized_worktree`; other classifications gate |
| `repository.stable` | final root, branch, HEAD, status, and tracked inventory byte-match initial observations | `repository_drift` / discard the report and rerun from a stable checkout | yes |

Disposition precedence is exact and first-match wins: closed-input failure
(exit 2), inaccessible root, expected-HEAD mismatch, repository drift, dirty
state, declaration failure, tracked-state failure, package failure, host-probe
failure, unexpected or malformed worktree state, then
`ready_for_host_confirmation`. The special `uninitialized_worktree`
observation is non-gating and cannot override another failure.

Host confirmations are emitted after machine checks, all as `unverified`, in
this exact order: `host.agents_window_rendered`, `host.account_entitlement`,
then for each of `hill`, `daisy`, `fury`, `may`, and `mack` in that order:
`host.seat.<seat>.identity`, `.model`, `.reasoning_effort`, `.sandbox_mode`,
`.repository_instructions`, `.mcp_inventory`, and `.agent_creation`. The guide
records the operator's observation separately. Every field except MCP inventory
must match its tracked declaration; MCP inventory is observation-only because
this mission defines no intended MCP contract. A required mismatch or
unobservable setting yields `REVISE_BEFORE_DEMO`.

The implementation may use only fixed read-only Git and executable-version
probes, without a shell, with bounded captured output and fixed timeouts. It may
not accept caller booleans asserting readiness, arbitrary command strings,
alternate seat paths, or caller-provided model identities. A dependency-free
closed projection scanner extracts only fixed single-line fields from the
repository's known TOML subset; it rejects missing, duplicate, malformed, or
unsupported target declarations and does not claim general TOML validation.

### 2. Shareable fresh-Hill bootstrap

Add one tracked prompt that a teammate can paste into a fresh VS Code Agents
chat. The trial guide is its sole bootstrap anchor. Invocation must provide the
exact expected HEAD; the guide itself binds Issue #307, the selected bounded
exercise, its scope, active gate, and next legal action. The prompt instructs
Hill to:

1. read `AGENTS.md` and the repository seat configuration;
2. run the teammate preflight;
3. verify the supplied expected HEAD and read only the guide's bounded #307
   exercise rather than searching historical missions;
4. report Issue #307, the exact exercise scope, current gate, and next legal
   action;
5. avoid transcript dumps and never ask for or expose passcodes or private
   signer material;
6. stop at a genuine human decision or actionable host-confirmation item.

The prompt grants no authority. A missing guide field, missing expected HEAD,
HEAD mismatch, or failure to identify all four required elements terminates as
`REVISE_BEFORE_DEMO`.

### 3. Secret-free trial and reset guide

Document the exact teammate flow:

- clone a fresh disposable checkout at an exact revision; do not use
  `shield worktree prepare` or copy policy/binding files from another person;
- open that root in VS Code and confirm the five displayed seats;
- run preflight and complete the explicit host confirmations;
- use the fresh-Hill prompt;
- select only the bounded #307 exercise;
- record setup time, commands, repairs, questions, and Coulson interventions;
- stop safely; cleanup is permitted only for the canonical disposable path
  created and recorded by this guide, after exact root/HEAD/ownership checks
  and proof that tracked, untracked, and ignored state contain no unexpected
  files. Reused worktrees are never removed, force is forbidden, and any
  mismatch stops for the operator.

The fresh clone is expected to classify as `uninitialized_worktree`. That is a
valid non-authoritative observation, not mission readiness. The disposition
mapping is fixed: `uninitialized_worktree` may reach only
`ready_for_host_confirmation`; `manual_policy_present` and `prepared_worktree`
are `action_required/unexpected_policy_state` for this cross-person trial;
`stale_or_malformed_worktree_state` is `action_required/malformed_policy_state`.
`GO_FOR_TEAMMATE_DEMO` remains unavailable until #307 either selects an
authority-none exercise or obtains a separately authorized teammate-owned
trial-policy provisioning step.

The guide must distinguish repository-shareable declarations from local
`.shield` state and must never instruct users to copy config, trusted bindings,
journals, signer records, passcodes, tokens, caches, or chat transcripts.

Raw preflight JSON is local-only because it contains the absolute disposable
root and may contain the Codex executable path. PR evidence uses a mandatory
publication-safe projection: replace the disposable root with
`<DISPOSABLE_ROOT>`, omit executable paths, and identify Codex only by source
classification, extension identity/version, and CLI version. Validation fails
if published evidence contains the raw disposable root or any absolute
executable path.

### 4. Remove tracked mission history

Delete the two currently tracked `.shield/journals/*.jsonl` files. Do not add a
replacement fixture under `.shield`. Existing synthetic tests remain in their
test-owned fixture roots.

Add a regression assertion that `git ls-files -z -- .shield` is exactly empty.
Separately inspect packed-package paths for unexpected signer, passcode,
credential, journal, runtime-state, or host-path content; do not apply those
terms as an unqualified repository-wide filename ban.

## Acceptance lanes

### Lane A — machine preflight (ACs: deterministic setup, seat verification,
actionable diagnostics)

- Add the closed readiness evaluator and read-only host adapter.
- Add the `shield teammate preflight` CLI route and JSON/human rendering.
- Test exact expected-HEAD binding, pre/post repository drift, exact seats,
  declared models/reasoning/sandbox settings, Git identity, cleanliness,
  executable and extension versions, timeout/unavailable/malformed probes,
  every doctor classification, fixed disposition precedence, and no mutations.

### Lane B — shareable context (ACs: bootstrap, secret separation, reset)

- Add the fresh-Hill prompt and teammate trial guide.
- Remove the two tracked historical journals.
- Add package/repository-surface regression coverage proving no runtime or
  secret state is shipped.

### Lane C — fresh-context proof (ACs: comprehension, measurements,
go/no-go disposition)

- Pack/install the exact candidate into a disposable consumer or use the exact
  built CLI from a clean disposable worktree.
- Run preflight from a fresh hosted Hill context with no prior chat.
- Verify that Hill identifies Issue #307, scope, gate, and next action from the
  sole bootstrap guide. Any missing element is `REVISE_BEFORE_DEMO`.
- Record setup time, commands, manual corrections, questions, and Coulson
  interventions in the publication-safe PR evidence projection.
- Return exactly `GO_FOR_TEAMMATE_DEMO` or `REVISE_BEFORE_DEMO`.

## Expected implementation paths

- `docs/missions/issue-306-vscode-teammate-readiness-plan.md`
- `docs/operations/vscode-agents-teammate-trial.md`
- `.codex/prompts/fresh-hill-teammate-trial.md`
- `packages/shield-team-system/src/teammate-readiness-v1.mts`
- `packages/shield-team-system/src/cli.mts`
- `packages/shield-team-system/tests/teammate-readiness-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- the two currently tracked `.shield/journals/*.jsonl` files (deletion only)

No new Nx project is justified. The capability belongs to the existing
`@shield/team-system` project because it composes its package version, doctor,
worktree-state, CLI, and canonical seat contract.

## Validation

- focused teammate-readiness and package-surface tests;
- `npm exec nx -- run @shield/team-system:build --skipNxCache`;
- `npm exec nx -- run @shield/team-system:test --skipNxCache`;
- packed JavaScript/TypeScript consumer and CLI startup proof;
- `git diff --check`;
- clean exact-head worktree;
- manual VS Code Agents-window confirmations recorded as human observations,
  never inferred from automated checks.
- publication-safe evidence tests proving absolute disposable-root and
  executable paths cannot appear in PR evidence.

## In-mission scope amendment 1 — delegated Git probe immutability

Exact-head review found that readiness correctly disables optional Git locks
for its direct probes but delegates prepared-worktree classification to
`inspectWorktreeStateV1()`, whose private Git environment does not carry the
same setting. Close that coupled seam without changing the mission objective,
effects, capabilities, risk, or output contract:

- add `packages/shield-team-system/src/worktree-state-v1.mts` and
  `packages/shield-team-system/tests/worktree-state-v1.test.mjs` to the exact
  implementation scope;
- set `GIT_OPTIONAL_LOCKS=0` for the inspector's fixed Git environment;
- test a real prepared-worktree classification with forced stale-stat
  conditions and prove index bytes and metadata remain unchanged;
- retain the readiness integration proof through the real inspector rather
  than a dependency stub.

This is a coupled path amendment only. It adds no command, authority system,
effect, model invocation, teammate-trial execution, publication, merge,
deployment, release, or external operation.

## Exclusions

- No VS Code extension or transport adapter.
- No new authority, mission, journal, signer, session, or MCP contract.
- No account entitlement or MCP-availability claim from repository data.
- No `shield worktree prepare` in the cross-person flow and no copy of personal
  chat, journals, evidence, configuration, trusted bindings, signer data,
  passcodes, credentials, or host-specific absolute paths.
- No production/enterprise repository installation, model invocation from the
  CLI, GitHub mutation, merge, deployment, release, or final acceptance.
- #307's live teammate demonstration remains a successor human trial.
