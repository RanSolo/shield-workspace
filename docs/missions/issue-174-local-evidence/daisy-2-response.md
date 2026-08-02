### TEST_SEAM

Inject `stdin`/`stdout` as constructor parameters on the terminal controller class:

```ts
class TerminalController {
  constructor(
    private readonly stdin: NodeJS.ReadableStream = process.stdin,
    private readonly stdout: NodeJS.WritableStream = process.stdout,
  ) {}
}
```

This is a single-argument injection that preserves the public API. No PTY required. `process.stdin` in Node has `.isTTY === false` when piped and `.isTTY === true` from a real TTY; tests pass mock streams with either value to cover both branches.

### STOP

