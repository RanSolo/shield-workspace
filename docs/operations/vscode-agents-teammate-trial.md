# VS Code Agents teammate trial

This guide is the sole bootstrap anchor for the first cross-person teammate
trial. It is descriptive, grants no authority, and does not prepare or execute
Issue #307. The operator records observations; repository declarations do not
prove what the host loaded.

## Frozen bounded exercise

- Issue: `#307`
- Source commit: `797d7b76ef902507e4af37da22e640087b925983`
- Plan SHA-256: `c4bc39dfc7adb0e14c247bf8cd41576ae484e0d05b2d1bcc331d63e1a4f58d11`
- Mission: `mission:issue-307-guided-review-smoke-v1`
- Subject: `subject:issue-307-guided-review-smoke-v1`
- Mode: `standalone-guided-review`
- Scope: `exploration/backend`
- Participant: non-Coulson
- Fixture: `sha256:22d0ecea8e6521d53d1d31d7053a2e0adb83ddaa0c7edf83fa8570258b85d1a4`
- Acceptance criterion: `AC-307-B1` — participant identifies the checkpoint
  and records one observation without a PIN or effect.
- Current gate/disposition: exactly `GO_FOR_TEAMMATE_DEMO`.
- Next legal action: complete this Issue #306 setup trial through the terminal
  `GO_FOR_TEAMMATE_DEMO` observation, then stop. This descriptive predecessor
  context grants no authority: Issue #306 never prepares or executes Issue
  #307.

## 1. Prepare the exact disposable checkout

Record the reviewed teammate-demo revision as `EXPECTED_HEAD`, its tracked
bootstrap path as `BOOTSTRAP`, and that bootstrap blob's lowercase SHA-256 as
`BOOTSTRAP_SHA256`. Record an absolute, normalized, absent path beneath one
existing canonical directory as `DISPOSABLE_ROOT`; never create or reuse that
destination before launch.

From the source checkout containing the tracked launcher, run exactly:

```text
npm run teammate:launch -- \
  --root "$DISPOSABLE_ROOT" \
  --expected-head "$EXPECTED_HEAD" \
  --bootstrap "$BOOTSTRAP" \
  --bootstrap-sha256 "$BOOTSTRAP_SHA256" \
  --json
```

The repository-local launcher uses its own Git object repository. It does not
clone, fetch, infer a branch, use a global `shield` or `nx`, or accept a source
root. It verifies the bootstrap, reviewed plan, and derived prompt before
creating a detached worktree. It then installs the exact lockfile with scripts
disabled, verifies the two-task Nx graph, builds through the target's pinned Nx,
and invokes only the target's built SHIELD preflight. Existing destinations and
adjacent receipts fail closed; no automatic cleanup or retry occurs.

Continue only when the result is `ready_for_host_confirmation`, authority is
`none`, observed HEAD equals `EXPECTED_HEAD`, and the adjacent
`$DISPOSABLE_ROOT.shield-teammate-launch-v1.json` receipt passes exact readback.
The receipt and publication-safe projection bind the bootstrap, reviewed plan,
prompt, target package and CLI, both complete `dist` manifests, and preflight
digest. A failure emits no VS Code open action.

Do not run `shield worktree prepare`. Do not copy configuration, trusted
bindings, journals, signer records, passcodes, credentials, tokens, caches,
mission state, evidence, or chat transcripts from another person or worktree.

Tracked `AGENTS.md`, `.codex/config.toml`, and `.codex/agents/*.toml` are
repository-shareable declarations. Anything under local `.shield`, host cache
directories, credentials, signer storage, or chat history is not shareable
trial context.

## 2. Confirm the authority-neutral preflight and open action

The launcher composes the preflight through the built target-local CLI using
this exact command shape; the operator does not substitute a global command:

```text
node "$DISPOSABLE_ROOT/packages/shield-team-system/dist/cli.mjs" teammate preflight \
  --root "$DISPOSABLE_ROOT" --expected-head "$EXPECTED_HEAD" --json
```

The preflight is read-only. It does not initialize SHIELD, copy policy, create
a mission, request a PIN, invoke a model, contact GitHub, or grant authority. A
fresh checkout must report `uninitialized_worktree`; this is a non-gating
observation and can lead only to `ready_for_host_confirmation`.

After verifying the successful launch result and receipt, execute the one
returned visible action yourself:

```text
code --new-window "$DISPOSABLE_ROOT"
```

The launcher never executes that action or claims that VS Code opened.

The other worktree classifications are closed:

- `manual_policy_present` or `prepared_worktree` means
  `action_required/unexpected_policy_state`.
- `stale_or_malformed_worktree_state` means
  `action_required/malformed_policy_state`.

Any machine-check failure stops the trial at `REVISE_BEFORE_DEMO`.

## 3. Record host confirmations in order

The raw report leaves every host-confirmation item `unverified`. Retain and
record the complete setup sequence in this exact order, using the preflight's
machine observations where named and separate operator observations for the
unverified items:

1. `host.agents_window_rendered`
2. `host.account_entitlement`
3. VS Code `version`, `build`, and `architecture`.
4. Codex `source`, OpenAI extension identity/version, and CLI version.
5. Seat `hill` creation/config: `identity`, `model`, `reasoning_effort`,
   `sandbox_mode`, `repository_instructions`, `mcp_inventory`, and
   `agent_creation`.
6. Seat `daisy` creation/config, with the same ordered fields.
7. Seat `fury` creation/config, with the same ordered fields.
8. Seat `may` creation/config, with the same ordered fields.
9. Seat `mack` creation/config, with the same ordered fields.
10. Terminal disposition `GO_FOR_TEAMMATE_DEMO`.

Confirm the Agents window renders exactly the five declared seats. For every
seat, identity, model, reasoning effort, sandbox mode, repository instructions,
and successful agent creation must be observable and match the tracked
declaration at `EXPECTED_HEAD`. Account entitlement must cover the declared
models. MCP inventory is observation-only: this trial defines no intended MCP
contract and repository files cannot prove inherited MCP availability.

Any required mismatch or unobservable required setting produces
`REVISE_BEFORE_DEMO`. Never convert an `unverified` item into an automated
claim.

## 4. Bootstrap Hill from the receipt-bound prompt and stop at the gate

Use the prompt path printed by the launcher's human-readable result and bound as
`result.artifacts.prompt.path` in its JSON result. For this frozen #307 trial it
must be exactly `.codex/prompts/issue-307-teammate-demo.md`. Paste that tracked,
receipt-bound prompt into a fresh Hill chat after replacing `<EXPECTED_HEAD>`.
Hill must identify all four of these from this guide alone:

1. Issue `#307`.
2. Scope `standalone-guided-review`, `exploration/backend`, non-Coulson, using
   the bound source and fixture above; `AC-307-B1` permits one checkpoint
   observation without PIN or effect.
3. Gate/disposition exactly `GO_FOR_TEAMMATE_DEMO`.
4. Next legal action: complete the ordered setup confirmations through the
   terminal disposition, then stop without preparing or executing Issue #307.

If any element is absent, return `REVISE_BEFORE_DEMO`. Do not create, prepare,
or execute the #307 mission; invoke a model for it; copy trust; publish; or
perform any PIN, effect, merge, deploy, or release action.

When explaining a boundary, pair visible session status with the final #307
plan and the configured seat contracts. Visible status is useful evidence, but
do not claim that it emits every plan, authority, identity, model, reasoning,
sandbox, or MCP distinction by itself.

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

## 6. Safe stop and retained checkout

Stop with exactly `GO_FOR_TEAMMATE_DEMO` or `REVISE_BEFORE_DEMO`. The former is
the final descriptive setup disposition and does not authorize Issue #307
preparation or execution.

The launcher performs no cleanup. Preserve the canonical disposable checkout
and adjacent receipt for inspection after either success or any post-creation
failure. Before any separately authorized cleanup, independently prove all of
the following:

- the path resolves exactly to the recorded `DISPOSABLE_ROOT` and is not a
  reused worktree;
- its HEAD is exactly `EXPECTED_HEAD`;
- its ownership matches the current operator;
- `git status --porcelain=v1 --untracked-files=all` is empty;
- `git ls-files --others --exclude-standard` is empty;
- ignored files are confined to lockfile-defined dependencies, the two built
  `dist` roots, and the receipt-bound isolated Nx state directories; and
- the adjacent receipt still has its recorded bytes and digest.

Any mismatch or unexpected tracked, untracked, or ignored state stops for the
operator. Force is forbidden. Do not remove a reused worktree and do not use a
broad, unresolved, home, workspace-root, or repository-root deletion target.
