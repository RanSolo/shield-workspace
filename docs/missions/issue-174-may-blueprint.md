# Issue #174 May blueprint

## Status and scope

- Mission: `mission:issue-174`
- Mission revision: `sha256:F83zJdbORCh9gIUGremVJrZPDpS9_gcYicWFsS_j4JQ`
- Base revision: `d5bde71e969d9615decdd577aad2cb84132914df`
- Status: exact blueprint ready for Fury review; no implementation authority

Change exactly:

1. `packages/shield-team-system/src/mission-cli.mts`
2. `packages/shield-team-system/tests/supervised-cli.test.mjs`

No package export map, dependency, signer, journal, authority, dispatch, or V0.3 contract change is included.

## Production design

Extract the interactive TTY branch into an internal module export named `readInteractivePasscode(inputStream, outputStream)`. Its structural input boundary includes only `isTTY`, `setRawMode`, `on`, `off`, `resume`, and `pause`; its output boundary includes only `write`. This direct module export exists for focused tests and is not added to a package export map.

`passcodeFromOptions(...)` remains responsible for option selection:

- `--passcode-stdin` retains its existing async-iteration implementation unchanged.
- A missing TTY still returns the existing usage error.
- The interactive branch delegates to `readInteractivePasscode(input, outputStream)`.

The helper writes only `Passcode: `, never echoes passcode bytes, and uses this lifecycle:

1. Define one idempotent settlement/cleanup path before any stream mutation.
2. Enable raw mode, attach the data listener, mark the stream for pause, then call `resume`; listener attachment precedes `resume` so synchronously delivered data cannot be lost.
3. Success on CR or LF, cancellation on byte 3, and empty submission all settle once through the shared path.
4. Shared cleanup removes the listener, attempts to restore raw mode, and pauses the resumed stream exactly once.
5. A synchronous setup or cleanup failure rejects with a bounded `MissionCliError`; cleanup uncertainty cannot become a successful passcode result.
6. Bytes after settlement are ignored. Backspace behavior remains unchanged.

No passcode value is logged, included in an error, or persisted outside the existing signer operation.

## Focused tests

Add a fake TTY input built from a local event emitter and counters for `setRawMode`, `on/off`, `resume`, and `pause`, plus a captured output writer. Tests directly import the internal helper and prove:

1. Success resolves the entered dummy value, removes the listener, restores raw mode, and pauses exactly once.
2. Ctrl-C rejects with the existing cancellation error and performs the same cleanup.
3. Empty Enter rejects with the existing empty-input error and performs the same cleanup.
4. A synchronously delivered chunk during `resume()` is handled because the listener is already attached.
5. A synchronous resume or cleanup failure rejects without leaving the listener attached; raw-mode restoration and pause are attempted.
6. Captured stdout and stderr never contain the dummy passcode.
7. Existing `--passcode-stdin` signer setup and authorization tests remain unchanged and passing.
8. The successful authorization test reads the durable journal/projection and proves exactly one authorization governance entry exists after command exit.

## Validation

From repository root:

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/supervised-cli.test.mjs`
3. `npm --prefix packages/shield-team-system test`
4. `git diff --check`

Mack validates the exact implementation revision after Wheels Up. Fury performs exact-revision conformance before human review.
