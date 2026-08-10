### ROOT_CAUSE

Confirmed. The stated root cause is correct: `input.resume()` puts stdin into flowing mode, but cleanup only restores raw mode and removes the listener. Without a corresponding `input.pause()`, stdin remains in flowing mode after the promise resolves or rejects. This causes two problems: (1) subsequent reads from stdin may consume data that was meant for other processes, and (2) terminal control is not fully released back to the parent shell's line discipline. The cleanup must be shared across all four exit paths (success with passcode, cancel via Ctrl-C, empty submission, and any exception during processing).

### MINIMUM_PATCH

The fix should extract cleanup into a single function called from every exit path:

```ts
const cleanup = (): void => {
  input.setRawMode(false);
  input.off("data", onData);
  input.pause(); // ← missing line
};
```

Call `cleanup()` before resolving, rejecting with empty passcode, rejecting with cancel error, and in a try/catch wrapper around the promise. Do not share this across `--passcode-stdin` (which uses async iteration, not raw mode). Keep the fix localized to `passcodeFromOptions`.

### TEST_SEAM

Use Node's built-in `child_process.spawn` with `stdio: ["pipe", "inherit", "inherit"]` to create a child process that exercises `passcodeFromOptions`, then write bytes to its stdin via the parent. Test three scenarios: (1) send a passcode followed by newline, verify exit code 0 and no hanging; (2) send Ctrl-C (byte 3), verify rejection and prompt returns; (3) send empty newline, verify rejection. Use `setTimeout` with a short deadline to detect hangs. Avoid PTY libraries for the basic lifecycle test; rely on pipe semantics which are portable across platforms.

### RISKS

1. **Backward compatibility**: If any caller currently relies on stdin being left in flowing mode after cancellation (unlikely but possible), this breaks that assumption. Verify no upstream code reads from stdin after `passcodeFromOptions` returns.
2. **Test flakiness**: Pipe-based tests can be sensitive to timing; the child process may not flush output before the parent writes, causing hangs. Use explicit synchronization points or short timeouts with clear failure messages.
3. **Raw mode edge cases**: On some platforms (e.g., Windows), `setRawMode(false)` may not fully restore terminal state without additional handling. If tests fail on Windows, defer platform-specific fixes to a follow-up.

### STOP

Missing evidence: whether any caller in the codebase reads from stdin after invoking `passcodeFromOptions`, and whether the existing test suite includes any interactive TTY scenarios that would catch this regression if implemented.

