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

Extract the interactive TTY branch into an internal module export named `readInteractivePasscode(inputStream, outputStream): Promise<string>`. Its structural input boundary includes only `setRawMode`, `on`, `off`, `resume`, and `pause`; its output boundary includes only `write`. Both existing `isTTY` checks remain in `passcodeFromOptions`. This direct module export exists for focused tests and is not added to a package export map.

`passcodeFromOptions(...)` remains responsible for option selection:

- `--passcode-stdin` retains its existing async-iteration implementation unchanged.
- A missing TTY still returns the existing usage error.
- The interactive branch delegates to `readInteractivePasscode(input, outputStream)`.

The helper writes exactly the fixed prompt `Passcode: ` and one fixed terminal newline `\n`; it never echoes passcode bytes. It uses this lifecycle:

1. Define one idempotent settlement/cleanup state machine before any stream mutation. Mark settlement before cleanup and ignore every subsequent byte.
2. Attempt raw-mode enablement, attach the data listener, mark the stream for pause, then call `resume`; listener attachment precedes `resume` so synchronously delivered data cannot be lost.
3. Hold any terminal outcome emitted synchronously by `resume()` until `resume()` returns. If `resume()` then throws, setup failure takes precedence over that pending outcome.
4. Success on CR or LF, cancellation on byte 3, and empty submission all enter the shared settlement path once.
5. Cleanup independently attempts listener removal, `setRawMode(false)`, `pause()`, and fixed newline output, each at most once. Failure of one cleanup action does not suppress attempts of the others. If `off()` fails, settled-state byte suppression remains active and the helper does not claim physical listener removal.
6. Precedence is cleanup failure over setup failure over intended success, cancellation, or empty outcome. Every setup or cleanup failure rejects with a fixed passcode-free `MissionCliError` message.
7. Backspace behavior remains unchanged.

No passcode value is logged, included in an error, or persisted outside the existing signer operation.

## Focused tests

Add a fake TTY input built from a local event emitter and counters for `setRawMode`, `on/off`, `resume`, and `pause`, plus a captured output writer. Tests directly import the internal helper and prove:

1. Success resolves the entered dummy value; cancellation and empty Enter reject with their existing errors. Each removes the listener, restores raw mode, pauses exactly once, and emits exactly `Passcode: \n`.
2. Separately inject failure in raw-mode enablement, listener registration, `resume`, listener removal, raw-mode restoration, `pause`, and newline writing. Assert the defined precedence and that every still-applicable cleanup action is attempted once.
3. Emit terminal data synchronously during `resume()` and then throw; assert setup failure wins over the pending terminal outcome.
4. Emit CRLF and post-settlement data; assert one result, one cleanup sequence, and no replay effect.
5. Helper output and every returned error omit the dummy passcode. Stderr assertions remain limited to CLI subprocess tests.
6. Existing `--passcode-stdin` signer setup and authorization tests remain unchanged and passing.
7. After successful authorization exits, parse durable journal bytes and prove exactly one `governance.decided`/`approve` entry contains Coulson mission-authorization evidence bound to the exact mission revision.
8. Retry authorization; assert nonzero exit, byte-identical journal, and still exactly one authorization entry.

## Validation

From repository root:

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/supervised-cli.test.mjs`
3. `npm --prefix packages/shield-team-system test`
4. `git diff --check`

Mack validates the exact implementation revision after Wheels Up. Fury performs exact-revision conformance before human review.
