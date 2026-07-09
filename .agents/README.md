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

