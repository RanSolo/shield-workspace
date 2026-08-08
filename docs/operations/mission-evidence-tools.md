# Mission evidence tools

These tools were promoted from ignored, mission-local prototypes after the
NXT-449 PDF-library Feature Flight exercised them across independent POC lanes.
They remain non-authoritative: their output can support a SHIELD decision, but
cannot create authority or advance mission state by itself.

## During validation: capture an exact command receipt

Use `evidence run` whenever a RED or GREEN command needs durable proof of the
worktree identity, exit status, redacted output, and declared artifact hashes.
The command executes without a shell, records Git state before and after, and
creates a new receipt without overwriting prior evidence.

```bash
npx shield-ops evidence run \
  --mission-id mission:example \
  --cwd /absolute/path/to/worktree \
  --artifact artifacts/result.pdf \
  --output /absolute/path/to/evidence/test.json \
  -- npm test
```

## At RED and GREEN gates: verify acceptance traceability

Use `acceptance check` after freezing a one-entry-per-criterion contract. It
checks that automated criteria name tests and commands, that required negative
cases are explicit, that receipts bind to the expected clean revision, and
that manual criteria have named observations at GREEN.

```bash
npx shield-ops acceptance check \
  --contract /absolute/path/to/acceptance-contract.json \
  --phase green \
  --expected-revision "$(git rev-parse HEAD)" \
  --report /absolute/path/to/evidence/acceptance.json \
  --markdown /absolute/path/to/evidence/acceptance.md
```

Both commands are create-only when writing evidence. Neither command signs,
authorizes, dispatches, publishes, merges, deploys, or releases anything.
