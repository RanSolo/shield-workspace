# tests

This folder contains focused framework checks.

Current coverage:

- `model-harness.test.mjs` verifies local-model role mapping, LM Studio native
  response parsing, and rejection of responses without an actionable message.
- `agent-boundaries.test.mjs` verifies that the core SHIELD prompt files encode
  the approved Hill, Daisy, and May boundaries along with the stuck protocol.

Run the current checks with:

```bash
node --test tests/model-harness.test.mjs
node --test tests/agent-boundaries.test.mjs
```

Future coverage should add agent-prompt integrity, mode links, shell-script
behavior, stop conditions, and repository reference validation.
