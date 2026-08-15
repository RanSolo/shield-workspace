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

- `.codex/config.toml` already registers exactly the five canonical seats and
  points to tracked seat cards. The VS Code/Codex host loads these repository
  files; no in-repository VS Code transport adapter exists or is required for
  the first trial.
- `AGENTS.md` already supplies the repository-wide routing and run-silent
  contract.
- `shield worktree prepare` and `shield doctor` already prepare and classify
  SHIELD policy without copying signer records, passcodes, journals, model
  context, or authority.
- The current tracked tree still contains two historical files under
  `.shield/journals/`. A fresh clone therefore receives personal mission
  history despite `.shield/` now being ignored.
- The currently observed host reports VS Code `1.133.0` and Codex CLI
  `0.147.0-alpha.6.5`. These are trial observations, not permanent compatibility
  promises.
- Seat-specific MCP requirements are not declared in `.codex`; seats inherit
  the host's available capabilities. The trial must not claim that an MCP is
  available merely because a repository file exists.

## Design

### 1. Authority-neutral teammate preflight

Add one read-only command:

```text
shield teammate preflight --root /absolute/repository/root [--json]
```

The command observes only fixed local facts and returns a closed report. It
must not initialize SHIELD, copy policy, create a mission, request a PIN,
invoke a model, contact GitHub, or mutate the repository.

The report binds:

- repository root, branch, exact HEAD, and cleanliness;
- installed Team System package version;
- observed VS Code and Codex CLI versions, including stable unavailable and
  malformed classifications;
- tracked presence of `AGENTS.md`, `.codex/config.toml`, and exactly the five
  canonical seat-card paths;
- the canonical seat names, configured model IDs, reasoning efforts, and
  sandbox modes parsed from the tracked repository files;
- absence of tracked `.shield` runtime state outside the explicitly allowed
  public scaffold paths;
- `shield doctor`/worktree-state classification without reinterpreting its
  authority-neutral result;
- host-confirmation items that cannot be proven from repository bytes,
  including Agents-window rendering, account model entitlement, inherited MCP
  availability, and successful agent creation.

The top-level disposition is exactly `ready_for_host_confirmation` or
`action_required`. Host-confirmation items are never represented as passed by
the command. Every failed machine check has one actionable next step. JSON is
complete and stable; human output is concise.

The implementation may use fixed read-only Git and executable-version probes.
It may not accept caller booleans asserting readiness, arbitrary command
strings, alternate seat paths, or caller-provided model identities.

### 2. Shareable fresh-Hill bootstrap

Add one tracked prompt that a teammate can paste into a fresh VS Code Agents
chat. It instructs Hill to:

1. read `AGENTS.md` and the repository seat configuration;
2. run the teammate preflight;
3. recover mission state only from durable repository evidence;
4. report the mission, scope, current gate, and next legal action;
5. avoid transcript dumps and never ask for or expose passcodes or private
   signer material;
6. stop at a genuine human decision or actionable host-confirmation item.

The prompt grants no authority and names no assumed mission.

### 3. Secret-free trial and reset guide

Document the exact teammate flow:

- clone or use a disposable clean worktree at an exact revision;
- open that root in VS Code and confirm the five displayed seats;
- run preflight and complete the explicit host confirmations;
- use the fresh-Hill prompt;
- select only the bounded #307 exercise;
- record setup time, commands, repairs, questions, and Coulson interventions;
- stop safely and remove only the known disposable worktree after proving it
  clean.

The guide must distinguish repository-shareable policy from local `.shield`
state and must never instruct users to copy config, trusted bindings, journals,
signer records, passcodes, tokens, caches, or chat transcripts.

### 4. Remove tracked mission history

Delete the two currently tracked `.shield/journals/*.jsonl` files. Do not add a
replacement fixture under `.shield`. Existing synthetic tests remain in their
test-owned fixture roots.

Add a regression assertion that the tracked repository surface contains no
`.shield/journals`, signer, evidence, report, artifact, temporary, or secret
state. The fixed public paths permitted for repository sharing are policy
scaffolding only; this change does not publish local `.shield/config.json` or
trusted bindings.

## Acceptance lanes

### Lane A — machine preflight (ACs: deterministic setup, seat verification,
actionable diagnostics)

- Add the closed readiness evaluator and read-only host adapter.
- Add the `shield teammate preflight` CLI route and JSON/human rendering.
- Test exact seats, models, reasoning, sandbox settings, Git identity,
  cleanliness, executable versions, unavailable tools, malformed repository
  files, uninitialized/prepared/malformed SHIELD state, and no mutations.

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
- Verify that Hill identifies the mission, scope, gate, and next action from
  durable evidence, or records the exact missing evidence.
- Record setup time, commands, manual corrections, questions, and Coulson
  interventions in the PR evidence.
- Return exactly `GO_FOR_TEAMMATE_DEMO` or `REVISE_BEFORE_DEMO`.

## Expected implementation paths

- `docs/missions/issue-306-vscode-teammate-readiness-plan.md`
- `docs/operations/vscode-agents-teammate-trial.md`
- `.codex/prompts/fresh-hill-teammate-trial.md`
- `packages/shield-team-system/src/teammate-readiness-v1.mts`
- `packages/shield-team-system/src/cli.mts`
- `packages/shield-team-system/package.json`
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

## Exclusions

- No VS Code extension or transport adapter.
- No new authority, mission, journal, signer, session, or MCP contract.
- No account entitlement or MCP-availability claim from repository data.
- No copy of personal chat, journals, evidence, trusted bindings, signer data,
  passcodes, credentials, or host-specific absolute paths.
- No production/enterprise repository installation, model invocation from the
  CLI, GitHub mutation, merge, deployment, release, or final acceptance.
- #307's live teammate demonstration remains a successor human trial.
