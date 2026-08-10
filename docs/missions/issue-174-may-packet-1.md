# Local May micro-context packet 1

Seat: `may` (implementation blueprint only)
Mission: `mission:issue-174`
Mission revision: `sha256:F83zJdbORCh9gIUGremVJrZPDpS9_gcYicWFsS_j4JQ`
Exact base: `d5bde71e969d9615decdd577aad2cb84132914df`

Produce the smallest exact implementation blueprint for issue #174. Do not edit files or claim implementation authority.

## Verified facts

- Production path: `packages/shield-team-system/src/mission-cli.mts`.
- Test path: `packages/shield-team-system/tests/supervised-cli.test.mjs`.
- Interactive `passcodeFromOptions` writes the prompt, enables raw mode, calls `input.resume()`, installs a data listener, then resolves/rejects after restoring raw mode and removing the listener.
- Cleanup never calls `input.pause()`, so the resumed stdin keeps Node alive.
- Success, Ctrl-C, and empty Enter duplicate cleanup logic.
- `--passcode-stdin` uses async iteration and must remain unchanged.
- Current tests cover only `--passcode-stdin`; pipe-based child tests cannot reach the interactive branch because `process.stdin.isTTY` is false.
- Local Daisy packet 1 confirmed the missing pause but proposed an invalid pipe test.
- A 939-input-token Daisy correction recovered the core test direction: inject a fake TTY-like input/output boundary rather than require a platform PTY.

## Acceptance criteria

1. Success returns control and pauses stdin.
2. Ctrl-C and empty Enter pause stdin and restore raw mode.
3. Authorization still appends exactly once before successful command exit.
4. Tests do not expose passcode bytes.
5. `--passcode-stdin` remains unchanged.

## Constraints

- No signer, evidence, journal, authority, dispatch, or V0.3 contract changes.
- No dependency or platform-specific PTY package.
- Avoid a public package export; a direct internal module export for focused tests must be justified.
- Prefer one shared idempotent cleanup path, listener-before-resume ordering, and cleanup on synchronous stream failures.
- Exact changed paths should remain the two paths above unless a third path is strictly necessary.

## Output contract

Return exactly:

- `PATHS`
- `FUNCTION_SHAPE` with exact proposed signature and lifecycle ordering
- `TEST_CASES` mapping each acceptance criterion to an assertion
- `RISKS` with at most three items
- `PACKET_VERDICT` stating whether this packet was sufficient and what evidence was missing

No code block longer than 25 lines.
