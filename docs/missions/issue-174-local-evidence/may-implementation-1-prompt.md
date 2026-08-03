# Local May implementation packet 1

All evidence is supplied. Do not request tools, inspect files, or emit XML. Return one unified diff for `packages/shield-team-system/src/mission-cli.mts` only.

Mission: `mission:issue-174`
Mission revision: `sha256:F83zJdbORCh9gIUGremVJrZPDpS9_gcYicWFsS_j4JQ`
Exact clean plan HEAD: `1fb9dd07fb677b7f8739b7ca4bc8fc0f2bdbf178`
Immutable code baseline: `d5bde71e969d9615decdd577aad2cb84132914df`
Authority: Wheels Up, bounded to Fury-approved plan

Current imports already bind `stdin as input` and `stdout as outputStream` from `node:process`.

Current function:

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

Implement an internal direct export `readInteractivePasscode(inputStream, outputStream): Promise<string>`; do not add a package export. Structural input methods: `setRawMode`, `on`, `off`, `resume`, `pause`. Output method: `write`. Keep both TTY checks and the entire `--passcode-stdin` branch in `passcodeFromOptions` unchanged, then delegate interactive work.

Required state machine:

1. Permit output only fixed `Passcode: ` and `\n`; never echo passcode bytes.
2. Mark raw-mode attempt, attach listener, mark resume attempt, then call resume. Listener precedes resume.
3. Hold terminal outcome synchronously emitted during resume until resume returns. If resume throws, setup failure wins.
4. Settle once before cleanup; ignore later bytes.
5. Independently attempt off, raw-mode false, pause, and newline once even when another cleanup action throws.
6. Precedence: cleanup failure > setup failure > success/cancel/empty. Use fixed passcode-free `MissionCliError` messages.
7. Preserve backspace behavior.

No changes outside the named file. Do not claim tests ran. Output only the diff.
