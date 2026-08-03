# Issue #174 micro-context evidence

## Runtime

- Seat runs: local Daisy and local May
- Model: `ornith-1.0-35b`
- Endpoint: loopback LM Studio native chat API
- Base revision: `d5bde71e969d9615decdd577aad2cb84132914df`
- No repository tools or write capabilities were supplied to the model.

## Packet observations

The table is host-observed experiment evidence. Each message prompt and raw assistant response is preserved under `docs/missions/issue-174-local-evidence/`; the manifest binds their SHA-256 digests, runtime identity, and native API usage fields.

| Run | Seat | Input tokens | TTFT | Approx. completion | Result |
|---|---:|---:|---:|---:|---|
| Daisy packet 1 | Daisy | 1,684 | 1.566s | 10.11s | Correct root cause and cleanup invariant; invalid pipe-based TTY test seam |
| Daisy correction | Daisy | 939 | 0.612s | 2.54s | Recovered dependency-injected fake-TTY direction; invented an unnecessary class |
| May blueprint 1 | May | 1,520 | 1.249s | about 11s | Correct lifecycle ordering; AC3 incorrectly proposed passcode text in stdout |
| May correction 1 | May | 1,065 | 0.647s | 1.55s | Unusable fabricated tool request and nonexistent path |
| May correction 2 | May | 1,166 | 0.744s | 5.03s | Usable corrected helper/journal/non-leakage shape; final verdict contradicted supplied content |
| May implementation 1 | May | 1,798 | 1.573s | 96.86s | Unusable 5,884-token diff: fabricated imports, duplicated helpers, polling, and incorrect settlement/cleanup control flow |

## Evidence-bound conclusion

The smallest useful packet in this run was Daisy's 939-token correction, but it was not independently implementation-safe. May required a stricter 1,166-token retry after a failed 1,065-token packet. These are candidate packet sizes for another measurement, not a demonstrated minimum or operating range.

Packet size alone did not preserve quality. Hill verification caught three material errors: a non-TTY pipe test, a passcode-leakage assertion, and a fabricated tool/path request. The experiment therefore supports micro-context runs as fast option generators, not autonomous authority or unreviewed implementation sources.

The first implementation packet strengthened that conclusion. Its prompt is preserved as `docs/missions/issue-174-local-evidence/may-implementation-1-prompt.md` at SHA-256 `219fbbfd8e3067533262d3a2472c608bfa7ba32afe1aa96ecb93f2a0b5073d53`. The LM Studio server log records model `ornith-1.0-35b`, 1,798 input tokens, 5,884 output tokens, 1.573-second time to first token, and 96.865-second total generation. The generated diff was not applied: it assumed nonexistent imports and file structure, duplicated many helpers, polled settlement, threw from the data callback, and failed the approved error-precedence design. Because the invoking terminal session did not retain the oversized response artifact, the server log is the observed runtime source and no response digest is claimed.

## Next measurement

The implementation run shows that a 1,798-token combined source-and-test diff packet is outside the useful operating range for this runtime configuration. A future measurement should split production behavior and tests into separate packets with strict output-token caps and require repository excerpts that match the exact file headers. Compare first-pass patch applicability, focused-test success, Hill corrections, Mack findings, and Fury escapes. More missions are required before claiming a repeatable sweet spot.
