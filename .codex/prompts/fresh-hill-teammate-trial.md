# Fresh Hill teammate trial bootstrap

This prompt grants no authority. Replace `<EXPECTED_HEAD>` with the accepted
40-character lowercase Issue #306 implementation revision before pasting it
into a fresh VS Code Agents chat. If it is missing or malformed, stop with
`REVISE_BEFORE_DEMO`.

Act only as the configured `hill` seat for this fresh teammate trial.

1. Read tracked `AGENTS.md`, `.codex/config.toml`, and the five configured seat
   cards from `<EXPECTED_HEAD>`.
2. Run this read-only command from the repository root:

   ```text
   shield teammate preflight --root <ABSOLUTE_DISPOSABLE_ROOT> --expected-head <EXPECTED_HEAD> --json
   ```

3. Confirm the report binds exactly `<EXPECTED_HEAD>`, has `authority: "none"`,
   and reaches only `ready_for_host_confirmation`. Treat every ordered host
   confirmation as `unverified` until the teammate observes it in the VS Code
   Agents window. Do not infer host state from repository declarations.
4. Use `docs/operations/vscode-agents-teammate-trial.md` as the sole bootstrap
   anchor for the bounded Issue #307 exercise. Do not search historical
   missions or use prior chat context. Bind it to final source commit
   `797d7b76ef902507e4af37da22e640087b925983` and plan SHA-256
   `c4bc39dfc7adb0e14c247bf8cd41576ae484e0d05b2d1bcc331d63e1a4f58d11`.
5. Report exactly these four descriptive elements from the guide: Issue #307,
   the exercise scope, the current gate, and the next legal action.
6. Retain the guide's exact setup order: Agents-window rendering; account
   entitlement; VS Code version/build/architecture; Codex source plus OpenAI
   extension and CLI versions; per-seat creation/config for `hill`, `daisy`,
   `fury`, `may`, and `mack`; then terminal `GO_FOR_TEAMMATE_DEMO`.
7. Pair visible session status with the final plan and configured seat
   contracts when explaining boundaries. Do not claim that status alone emits
   every plan, authority, identity, model, reasoning, sandbox, or MCP
   distinction.

Do not prepare or execute Issue #307. Do not invoke a model for the exercise,
request a PIN, copy trust or local `.shield` state, publish raw preflight JSON,
or ask for or expose passcodes, tokens, private signer material, or chat
transcripts. Do not dump this chat transcript.

A missing guide field, missing expected HEAD, HEAD mismatch, machine-check
failure, required host mismatch, unobservable required host setting, or failure
to identify all four descriptive elements terminates as
`REVISE_BEFORE_DEMO`. Otherwise stop at terminal `GO_FOR_TEAMMATE_DEMO` or the
first actionable host-confirmation item. This descriptive disposition adds no
Issue #307 preparation or execution authority.
