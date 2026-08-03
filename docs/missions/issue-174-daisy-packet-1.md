# Local Daisy micro-context packet 1

Seat: `daisy` (read-only reconnaissance)
Mission: `mission:issue-174`
Mission revision: `sha256:F83zJdbORCh9gIUGremVJrZPDpS9_gcYicWFsS_j4JQ`
Repository: `RanSolo/shield-workspace`
Exact base revision: `d5bde71e969d9615decdd577aad2cb84132914df`

## Objective

Identify the smallest correct implementation and test surface for issue #174. Do not implement, grant authority, redesign signing, or discuss unrelated mission-journal behavior.

## Acceptance criteria

1. Successful interactive authorization returns to a fresh shell prompt without Ctrl-C.
2. Cancelled and empty-passcode paths release stdin and restore terminal mode.
3. Authorization remains durably recorded exactly once before successful exit.
4. Tests prove interactive prompt lifecycle without exposing passcode content.
5. `--passcode-stdin` behavior remains unchanged.

## Exact observed production surface

```ts
async function passcodeFromOptions(options: ParsedOptions): Promise<string> {
  if (options.flags.has("--passcode-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const passcode = Buffer.concat(chunks).toString("utf8").trim();
    if (!passcode) throw new MissionCliError("Passcode input was empty.");
    return passcode;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new MissionCliError("Passcode prompt requires a TTY; use --passcode-stdin for automation.");
  outputStream.write("Passcode: ");
  input.setRawMode(true);
  input.resume();
  return await new Promise<string>((resolvePasscode, reject) => {
    let passcode = "";
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          input.setRawMode(false);
          input.off("data", onData);
          outputStream.write("\n");
          reject(new MissionCliError("Passcode prompt cancelled."));
          return;
        }
        if (byte === 10 || byte === 13) {
          input.setRawMode(false);
          input.off("data", onData);
          outputStream.write("\n");
          if (!passcode) reject(new MissionCliError("Passcode input was empty."));
          else resolvePasscode(passcode);
          return;
        }
        if (byte === 127 || byte === 8) passcode = passcode.slice(0, -1);
        else if (byte >= 32) passcode += String.fromCharCode(byte);
      }
    };
    input.on("data", onData);
  });
}
```

Observed root cause: `input.resume()` is called, but terminal cleanup only restores raw mode and removes the listener; it never calls `input.pause()`.

Existing tests cover `--passcode-stdin` signer setup and authorization using `spawnSync`, but there is no interactive TTY lifecycle test.

## Requested output contract

Return exactly five short sections:

1. `ROOT_CAUSE` — confirm or reject the stated cause.
2. `MINIMUM_PATCH` — exact cleanup behavior and whether it should be shared across success, cancel, empty, and exceptional paths.
3. `TEST_SEAM` — smallest portable test strategy; avoid platform-specific PTY assumptions if possible.
4. `RISKS` — at most three regression risks.
5. `STOP` — one sentence naming any missing evidence.

Do not include code longer than 20 lines. Do not claim commands, edits, or tests occurred.
