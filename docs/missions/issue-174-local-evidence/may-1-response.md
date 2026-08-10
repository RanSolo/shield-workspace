## PATHS

```
packages/shield-team-system/src/mission-cli.mts
packages/shield-team-system/tests/supervised-cli.test.mjs
```

## FUNCTION_SHAPE

```
passcodeFromOptions(options, input=process.stdin, output=process.stdout): Promise<string>
  → if stdin.isTTY:
    - install data listener (before resume)
    - enable raw mode
    - resume stdin
    - on success/Ctrl-C/empty: disable raw mode, remove listener, pause stdin
    - resolve with trimmed passcode
  → else if --passcode-stdin:
    - async iterate Buffer.from chunked input
    - resolve with trimmed bytes joined
  → else: reject with usage message
```

Lifecycle ordering enforced by single cleanup function called on all three terminal paths. Stdin paused only when raw mode was enabled (TTY path). Non-TTY path unchanged.

## TEST_CASES

| Criterion | Assertion |
|---|---|
| AC1: Success returns control and pauses stdin | After resolving passcode, `input.pause` called exactly once; child command exits cleanly without hanging test process |
| AC2: Ctrl-C and empty Enter pause stdin and restore raw mode | After simulated SIGINT or empty line, `input.removeListener('data',...)` called; raw mode disabled; no unhandled rejection |
| AC3: Authorization appends exactly once before successful command exit | Child stdout contains passcode substring exactly one time across full output |
| AC4: Tests do not expose passcode bytes in assertions | Test asserts on structural properties (exit code, listener count), not literal passcode value |
| AC5: `--passcode-stdin` remains unchanged | Existing pipe test continues to pass without modification; no new TTY path exercised by stdin-stream tests |

## RISKS

1. **Listener-before-resume ordering sensitive to Node versions** — if `resume()` is called before `on('data')`, first chunk may be lost. Mitigated by strict ordering in blueprint, but must be verified on CI Node version.
2. **`input.pause()` on non-TTY streams can throw** — if a test accidentally passes a stream where raw mode was enabled but pause fails silently or throws, cleanup must catch. Blueprint includes try/catch around `pause()`.
3. **Test harness injects fake TTY-like boundary** — tests must simulate `isTTY=true` without a real PTY. Requires careful mock of stdin/stdout with `pause`, `resume`, `setRawMode`, and `removeListener` tracking. Daisy packet 1's pipe test was invalid; this is the corrected approach.

## PACKET_VERDICT

**Sufficient.** Packet 1 provided exact production path, exact failure mode (missing `input.pause()`), confirmed `--passcode-stdin` isolation, identified the core test direction (fake TTY boundary), and recovered from Daisy's invalid pipe proposal with a valid alternative. Missing: no explicit evidence that the listener-before-resume ordering works on the CI Node version — this should be verified during implementation, not held as a precondition. No additional packet required to authorize blueprint authoring.

