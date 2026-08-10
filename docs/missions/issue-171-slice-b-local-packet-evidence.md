# Issue #171 Slice B local packet evidence

## Runtime and scope

- Mission: `mission:issue-171-slice-b`
- Mission revision: `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`
- Exact base: `081187204cf7ac3e57907a418a9e891119962740`
- Runtime: local LM Studio model `ornith-1.0-35b`
- Tool access: none; repository evidence was supplied in bounded prompts

## Observations

| Packet | Input | Output | TTFT | Result |
|---|---:|---:|---:|---|
| Daisy store/replay recon | 1,237 tokens | 2,544 tokens | 1.412s | Useful per-session/replay questions, but unsafe raw-ID path, skipped truncated tail, wrong field name, and oversized stateful API |
| May blueprint challenge | 1,345 tokens | 806 tokens | 0.930s | Concise critique shape, but invented paths, wrong receipt types, batch sink, and contradictory conflict behavior |

The first host attempt failed before model invocation because the clean worktree had no compiled `dist`; the identical Daisy packet was rerun after a build using the already-installed shared toolchain. That setup failure is not counted as a model run.

## Evidence-bound conclusion

Packets around 1,200–1,350 input tokens produced fast, relevant option material but did not preserve repository or contract exactness. The smaller May completion was easier to reject quickly than the longer Daisy response, so bounded output is as important as bounded input. Neither response is eligible as an implementation blueprint without hosted May synthesis and Fury review.

This is two observations, not a demonstrated operating range. A future run should cap local output near 800 tokens and provide exact allowed path candidates and literal receipt signatures when repository exactness matters.
