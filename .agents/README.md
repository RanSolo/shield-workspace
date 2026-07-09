# Agent Harness Notes

This directory contains local agent workflow support for the project. It is not
application runtime code.

The first setup is an Ornith role harness:

- `manager` chooses issue order and stop/continue decisions.
- `worker` investigates, proposes commands, and drafts patches.
- `reviewer` checks plans, diffs, verification, and scope.

All roles use the same local LM Studio model by default:

```text
http://127.0.0.1:1234/v1
ornith-1.0-35b
```

Run a role:

```bash
node .agents/harness/ask-ornith.mjs manager "Pick the next issue from this list..."
```

Or pipe a larger mission:

```bash
cat mission.md | node .agents/harness/ask-ornith.mjs worker
```

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
