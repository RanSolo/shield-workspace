# Issue #312 — GitHub Copilot SHIELD seat adapter plan

## Identity

- Issue: `#312 — Add GitHub Copilot adapter for SHIELD seats`
- Repository: `RanSolo/shield-workspace`
- Planning base: `e37461f022544bdbd4246e00057a29e6047c2d04`
- Branch: `agent/issue-312-copilot-adapter`
- Proving failure: `#307` returned `REVISE_BEFORE_DEMO — wrong agent-host adapter`.
- Authority: planning only until Fury reviews this exact plan and Coulson records
  implementation authority.

## Objective

Add the smallest workspace-scoped GitHub Copilot custom-agent adapter that
exposes the five canonical SHIELD seats in the VS Code Copilot agent picker.
Use the operator's selected, employer-entitled Copilot model instead of pinning
repository model names. Preserve the existing `.codex` adapter unchanged.

## Frozen paths

Implementation may change only:

1. `.github/agents/hill.agent.md`
2. `.github/agents/daisy.agent.md`
3. `.github/agents/fury.agent.md`
4. `.github/agents/may.agent.md`
5. `.github/agents/mack.agent.md`
6. `docs/operations/vscode-agents-teammate-trial.md`
7. `packages/shield-team-system/tests/github-copilot-agent-adapter.test.mjs`
8. `packages/shield-team-system/src/copilot-teammate-readiness-v1.mts`
9. `packages/shield-team-system/tests/copilot-teammate-readiness-v1.test.mjs`
10. `packages/shield-team-system/src/cli.mts`
11. `packages/shield-team-system/tests/package-surface.test.mjs`
12. `tools/teammate-launch.mjs`
13. `tools/teammate-launch.test.mjs`

The plan itself is the only additional publication path.

## Contract

Every seat file is a VS Code workspace custom agent in `.github/agents` with
closed YAML frontmatter containing exactly:

- `name`
- `description`
- `argument-hint`
- `target: vscode`
- `user-invocable: true`
- `disable-model-invocation`
- `tools`
- `agents` only for Hill
- optional `handoffs` only where the route is deterministic

No file declares `model`; the active Copilot picker selection and enterprise
entitlement remain host observations, not repository claims.

Canonical picker names are `Hill`, `Daisy`, `Fury`, `May`, and `Mack`.
Filenames are the stable lowercase seat identifiers. All five are directly
user-invocable because the teammate must be able to select and understand each
seat during the trial. Hill sets `disable-model-invocation: false`.
Specialists set `disable-model-invocation: true`: they remain picker-visible,
while Hill's explicit allowlist is the only model-driven specialist route.

## Tool and routing boundaries

- Hill: orchestration tools plus the `agent` tool; `agents` is exactly
  `[Daisy, Fury, May, Mack]`, using the exact case-sensitive declared names.
  Hill may inspect and coordinate but must not own
  production implementation. Handoffs expose the ordinary Daisy recon, Fury
  review, May implementation, and Mack validation routes. Every handoff uses an
  exact target, a gate-specific prompt, `send: false`, and no nested model.
- Daisy: read/search/web tools only; no edit, execute, or agent tool.
- Fury: read/search/web tools only; no edit, execute, or agent tool.
- May: read/search/web/edit/execute tools; no agent tool.
- Mack: read/search/execute tools; no edit or agent tool.

Specialists omit `agents`; they do not coordinate subagents.

Tool names must be supported VS Code built-in tool or tool-set identifiers. If
the installed host does not expose one declared tool, the host confirmation
fails; repository text may not claim availability.

Each card includes the same compact invariants:

- Coulson, Fitz, and Simmons are human seats and cannot be simulated.
- missing, stale, malformed, ambiguous, or conflicting authority fails closed;
- conclusions and validation bind to exact repository revisions;
- no merge, deployment, release, destructive effect, or expanded scope is
  implied;
- actions and evidence are reported truthfully;
- cross-seat orchestration returns to Hill.

## Packets

### Packet A — AC-1 through AC-4: discoverable seat cards

Add the five `.agent.md` files with model inheritance, picker visibility, exact
seat duties, and least-capability tool declarations.

### Packet B — AC-5: Hill routes without becoming implementation

Add Hill's exact subagent allowlist and non-auto-sending handoffs. Keep each
specialist's orchestration boundary explicit.

### Packet C — AC-6: executable repository validation

Add one focused Node test that reads the tracked files and proves:

- exactly the five expected agent files exist;
- frontmatter is parsed from the supported closed YAML subset with duplicate
  and unknown key rejection, exact types, and closed nested handoffs;
- no `model` field exists;
- all five are user-invocable; only Hill is generally model-invocable;
- canonical names and filenames match;
- tool sets preserve each seat boundary;
- only Hill declares `agent`, the exact case-sensitive four-agent allowlist,
  and handoffs; every allowlist and handoff target resolves exactly once;
- every handoff has `send: false` and no model at any depth;
- every body preserves the shared human-authority and exact-revision rules;
- `.codex/agents` remains present and unchanged relative to the planning base.

Update the teammate-trial guide to distinguish Copilot picker agents from
Codex subagents and to require visible Copilot picker discovery for this trial.

### Packet D — AC-7: versioned Copilot readiness and launch boundary

Preserve `shield.teammate-readiness.v1` and its default Codex behavior. Add a
separate closed `shield.copilot-teammate-readiness.v1` contract selected only
by:

```text
shield teammate preflight --host github-copilot
```

The Copilot contract:

- binds adapter kind `github-copilot`;
- reads exactly the five tracked `.github/agents/*.agent.md` blobs at expected
  HEAD and records their ordered SHA-256 digests;
- reuses the same strict frontmatter validator as repository validation;
- probes VS Code plus extension `github.copilot-chat`, never OpenAI extension
  or global Codex CLI availability;
- records model as host-selected and entitlement as unverified;
- emits ordered host confirmations for picker rendering, account entitlement,
  and each seat's identity, selected model, tools, instructions, and creation;
- remains authority `none` and publication-safe.

Extend the launcher compatibly: existing bootstrap v1 continues to select the
Codex readiness contract unchanged. A new closed bootstrap v2 requires
`agentHost: "github-copilot"`, invokes the Copilot preflight explicitly, and
binds the adapter kind, five file paths/digests, report digest, and extension
observation in its durable receipt. Wrong-host reports fail closed.

This issue does not rewrite #307's reviewed plan or bootstrap. After merge,
#307 must revise and re-review its plan and issue a bootstrap v2 bound to the
merged Copilot adapter before retrying the actual picker.

## Validation

Run through Nx:

```text
npm exec nx run @shield/team-system:build
npm exec nx run @shield/team-system:test
node --test tools/teammate-launch.test.mjs
```

Also run:

```text
git diff --check
```

Mack validates the exact implementation revision. Fury then performs exact-
revision conformance review. Actual picker rendering remains an explicit host
observation in the subsequent #307 retry.

## Stop conditions

- A required tool or frontmatter field is not supported by current official VS
  Code custom-agent documentation.
- The implementation would pin a model or infer enterprise entitlement.
- The implementation needs to modify Codex seat files, SHIELD authority,
  journals, signer state, or teammate-trial execution.
- Copilot support would require changing or reinterpreting the existing Codex
  readiness contract instead of adding an explicit versioned route.

Stop after Mack/Fury review and draft publication. Do not run #307, merge,
deploy, or release.
