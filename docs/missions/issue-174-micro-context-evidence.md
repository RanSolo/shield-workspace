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

## Evidence-bound conclusion

The smallest useful packet in this run was Daisy's 939-token correction, but it was not independently implementation-safe. May required a stricter 1,166-token retry after a failed 1,065-token packet. These are candidate packet sizes for another measurement, not a demonstrated minimum or operating range.

Packet size alone did not preserve quality. Hill verification caught three material errors: a non-TTY pipe test, a passcode-leakage assertion, and a fabricated tool/path request. The experiment therefore supports micro-context runs as fast option generators, not autonomous authority or unreviewed implementation sources.

## Next measurement

If implementation is authorized, give local May one exact function-and-test packet at one of the observed candidate sizes. Compare first-pass patch applicability, focused-test success, Hill corrections, Mack findings, and Fury escapes against these planning runs. More missions are required before claiming a repeatable sweet spot.
