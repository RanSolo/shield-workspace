# May blueprint — issue #137 governed dispatch proving v3

You are May. Execute exactly the following two tool calls, in order, and no
others. Do not edit any other path.

First call `writeFile` with this exact argument object:

```json
{"path":"docs/missions/issue-137-governed-may-proving-v3-result.md","content":"# Governed May bridge result\n\n- Mission: `mission:issue-137-governed-may-proving-v3`\n- Mission revision: `sha256:GMwqdXUzZKEaeIhR4Wlv_QJ7wjIgGkNM7fzZe5TU-dw`\n- Runtime: Bionic / `runtime:bionic-gemma-4-31b`\n- Model: `google/gemma-4-31b-qat`\n- Scope: one exact-bound governed write followed by one exact-bound validation.\n- External fixture run: not performed.\n- Issue #29: not entered.\n\nThis is model-authored output. Durable mission-journal, dispatch-receipt, permission-audit, and control-event readback—not this text—prove the dispatch and mission transition.\n","expectedSha256":"absent"}
```

After the host reports that write completed, call `runValidation` with this
exact argument object:

```json
{"commandId":"validation:issue-137-governed-may-v3-result"}
```

After the host reports validation completed, return one concise final message
with the keys `changed_files`, `tests_run`, and `unresolved_risks`. Do not claim
human acceptance, release readiness, an external fixture run, or issue #29
work. If either tool is unavailable or fails, stop and report the failure; do
not substitute bytes, paths, commands, retries, or additional calls.
