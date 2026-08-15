# VS Code Agents teammate trial

This guide is the sole bootstrap anchor for the first cross-person teammate
trial. It is descriptive, grants no authority, and does not prepare or execute
Issue #307. The operator records observations; repository declarations do not
prove what the host loaded.

## Frozen bounded exercise

- Issue: `#307`
- Source commit: `657fe1afc66e1b54975232255b8c1e8ee81d732f`
- Source SHA-256: `ec7ddf7ed0f84bf22f840a869151480ea0742f0d14e33337f089039d4afc46fd`
- Mission: `mission:issue-307-guided-review-smoke-v1`
- Subject: `subject:issue-307-guided-review-smoke-v1`
- Mode: `standalone-guided-review`
- Scope: `exploration/backend`
- Participant: non-Coulson
- Fixture: `sha256:22d0ecea8e6521d53d1d31d7053a2e0adb83ddaa0c7edf83fa8570258b85d1a4`
- Acceptance criterion: `AC-307-B1` — participant identifies the checkpoint
  and records one observation without a PIN or effect.
- Current gate: `dependency_not_ready` until an accepted Issue #306 revision
  and the human decision `GO_FOR_TEAMMATE_DEMO` both exist.
- Next legal action: complete Issue #306 acceptance, then obtain the genuine
  `GO_FOR_TEAMMATE_DEMO` human decision. Issue #306 never prepares or executes
  this exercise.

## 1. Create the disposable checkout

Record the exact candidate revision as `EXPECTED_HEAD`. It must be the accepted
Issue #306 implementation revision, expressed as 40 lowercase hexadecimal
characters. Create a new canonical disposable directory and record its exact
path as `DISPOSABLE_ROOT`; never reuse an existing checkout.

Clone the repository into that empty path, fetch the accepted revision if
needed, detach at `EXPECTED_HEAD`, and verify both of these commands before
opening VS Code:

```text
git -C "$DISPOSABLE_ROOT" rev-parse HEAD
git -C "$DISPOSABLE_ROOT" status --porcelain=v1 --untracked-files=all
```

The first output must equal `EXPECTED_HEAD`; the second must be empty. Do not
run `shield worktree prepare`. Do not copy configuration, trusted bindings,
journals, signer records, passcodes, credentials, tokens, caches, mission
state, evidence, or chat transcripts from another person or worktree.

Tracked `AGENTS.md`, `.codex/config.toml`, and `.codex/agents/*.toml` are
repository-shareable declarations. Anything under local `.shield`, host cache
directories, credentials, signer storage, or chat history is not shareable
trial context.

## 2. Run the authority-neutral preflight

Open exactly `DISPOSABLE_ROOT` in VS Code. From that root run:

```text
shield teammate preflight --root "$DISPOSABLE_ROOT" --expected-head "$EXPECTED_HEAD" --json
```

The command is read-only. It does not initialize SHIELD, copy policy, create a
mission, request a PIN, invoke a model, contact GitHub, or grant authority. A
fresh clone is expected to report `uninitialized_worktree`; this is a
non-gating observation and can lead only to `ready_for_host_confirmation`.

The other worktree classifications are closed:

- `manual_policy_present` or `prepared_worktree` means
  `action_required/unexpected_policy_state`.
- `stale_or_malformed_worktree_state` means
  `action_required/malformed_policy_state`.

Any machine-check failure stops the trial at `REVISE_BEFORE_DEMO`.

## 3. Record host confirmations in order

The raw report leaves every item `unverified`. Observe and record them
separately in this exact order:

1. `host.agents_window_rendered`
2. `host.account_entitlement`
3. For each seat `hill`, `daisy`, `fury`, `may`, and `mack`, in that order:
   `identity`, `model`, `reasoning_effort`, `sandbox_mode`,
   `repository_instructions`, `mcp_inventory`, and `agent_creation`.

Confirm the Agents window renders exactly the five declared seats. For every
seat, identity, model, reasoning effort, sandbox mode, repository instructions,
and successful agent creation must be observable and match the tracked
declaration at `EXPECTED_HEAD`. Account entitlement must cover the declared
models. MCP inventory is observation-only: this trial defines no intended MCP
contract and repository files cannot prove inherited MCP availability.

Any required mismatch or unobservable required setting produces
`REVISE_BEFORE_DEMO`. Never convert an `unverified` item into an automated
claim.

## 4. Bootstrap fresh Hill and stop at the gate

Paste `.codex/prompts/fresh-hill-teammate-trial.md` into a fresh Hill chat after
replacing `<EXPECTED_HEAD>`. Hill must identify all four of these from this
guide alone:

1. Issue `#307`.
2. Scope `standalone-guided-review`, `exploration/backend`, non-Coulson, using
   the bound source and fixture above; `AC-307-B1` permits one checkpoint
   observation without PIN or effect.
3. Gate `dependency_not_ready` until accepted Issue #306 plus
   `GO_FOR_TEAMMATE_DEMO`.
4. Next legal action: finish Issue #306 acceptance and obtain the genuine human
   go decision.

If any element is absent, return `REVISE_BEFORE_DEMO`. Do not create, prepare,
or execute the #307 mission; invoke a model for it; copy trust; publish; or
perform any PIN, effect, merge, deploy, or release action.

## 5. Measurements and publication-safe evidence

Record setup time, exact commands, manual repairs, teammate questions, and
Coulson interventions. Record only observations actually made. Raw preflight JSON is local-only because it contains `DISPOSABLE_ROOT` and may contain the
absolute Codex executable path.

PR evidence must use the publication-safe projection produced by
`projectTeammateReadinessForPublicationV1` from the built
`packages/shield-team-system/dist/teammate-readiness-v1.mjs` module. The
projection replaces the repository root with `<DISPOSABLE_ROOT>`, omits every
executable path, and identifies Codex only by source classification, OpenAI
extension identity/version, and CLI version.

Before publication, validation must fail if the projected evidence contains
the raw `DISPOSABLE_ROOT`, an `executablePath` field, or any absolute executable
path. Never publish the raw report, host-path strings, transcripts, local
`.shield` content, credentials, trust material, or passcodes.

## 6. Safe stop and reset

Stop with exactly `GO_FOR_TEAMMATE_DEMO` or `REVISE_BEFORE_DEMO`; only a genuine
authorized human can supply the former. This guide does not.

Cleanup is permitted only for the canonical disposable path created and
recorded in section 1. Before cleanup, independently prove all of the following:

- the path resolves exactly to the recorded `DISPOSABLE_ROOT` and is not a
  reused worktree;
- its HEAD is exactly `EXPECTED_HEAD`;
- its ownership matches the current operator;
- `git status --porcelain=v1 --untracked-files=all` is empty;
- `git ls-files --others --exclude-standard` is empty; and
- an ignored-file inventory contains no files.

Any mismatch or unexpected tracked, untracked, or ignored state stops for the
operator. Force is forbidden. Do not remove a reused worktree and do not use a
broad, unresolved, home, workspace-root, or repository-root deletion target.
