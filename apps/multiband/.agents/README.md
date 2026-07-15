# Agent Harness Notes

This directory contains local agent workflow support for the project. It is not
application runtime code.

The first setup is a role harness with model routing in
`.agents/config/models.json`:

- `manager` chooses issue order and stop/continue decisions.
- `worker` investigates, proposes commands, and drafts patches.
- `designer` proposes confident UI direction, copy, layout, and screenshot needs.
- `reviewer` checks plans, diffs, verification, and scope.

The repo currently defaults to:

```text
manager      -> local Ornith
worker       -> local Ornith
designer     -> local Ornith
reviewer     -> local Ornith
orchestrator -> local Ornith
daisy        -> local Ornith
fury         -> OpenAI GPT-5.6 Terra
mm           -> OpenAI GPT-5.6
```

Run a role:

```bash
node .agents/harness/ask-local.mjs manager "Pick the next issue from this list..."
```

Or pipe a larger mission:

```bash
cat mission.md | node .agents/harness/ask-local.mjs worker
```

For design-heavy work, start with the designer role before implementation:

```bash
node .agents/harness/ask-local.mjs designer "Design the landing page for issue #10..."
```

The role prompt and the model choice are separate concerns:

- The role prompt still comes from `.agents/roles/<role>.md`.
- The model and provider come from `.agents/config/models.json`.
- Machine-specific overrides can come from environment variables like
  `MODEL_MANAGER`, `MODEL_DAISY`, `MODEL_FURY`, `MODEL_MM`,
  `LOCAL_MODEL_BASE_URL`, and `OPENAI_API_KEY`.

This lets one project use only local models while another mixes local routing
with stronger remote review models without changing the harness code.

Before creating an implementation branch or opening a pull request, refresh the
base branch so agent work does not inherit stale CI or Vercel failures:

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c <work-branch>
```

If work is already on a branch, merge the current base before opening the PR:

```bash
git fetch origin
git merge origin/main
```

When opening a pull request for an issue, include the correct GitHub issue
keyword in the PR body:

- Use `Fixes #<issue-number>` when the PR fully completes the issue.
- Use `Refs #<issue-number>` when the PR is partial progress or supporting work.

Do not use `Fixes` for partial work.

For UI pull requests, include screenshots directly in GitHub-visible PR context:

- Capture desktop and mobile screenshots for affected screens.
- Attach screenshots to the PR body or a PR comment so reviewers can see them
  without access to local files.
- Local screenshot paths are useful for development notes, but they are not
  sufficient for review.
- If screenshots cannot be attached, say why in the PR body and list the exact
  visual check that still needs to happen.
