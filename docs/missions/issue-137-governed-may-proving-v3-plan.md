# Hill plan — issue #137 governed May proving v3

## Exact mission boundary

- Mission: `mission:issue-137-governed-may-proving-v3`
- Mission revision: `sha256:GMwqdXUzZKEaeIhR4Wlv_QJ7wjIgGkNM7fzZe5TU-dw`
- Subject: `github:RanSolo/shield-workspace/issue/137`
- Base revision: `75cbe9974bab03c851601cde8e9249a63c384c0c`
- Branch: `agent/issue-137-governed-may-proving-v3`
- Model: `google/gemma-4-31b-qat`
- Required loaded runtime identity: `runtime:bionic-gemma-4-31b`
- Tool executor: `executor:shield-may-local`

The mission proves one production `runGovernedMayDispatchStepV1` call after the
#191 correction. It does not run the external fixture, enter #29, alter product
contracts, merge, deploy, release, or fabricate a human gate.

## Frozen effect

May may perform exactly two ordered operations:

1. create the absent file
   `docs/missions/issue-137-governed-may-proving-v3-result.md` with the exact
   UTF-8 bytes frozen in the reviewed May blueprint;
2. run the one registered shell-free command
   `validation:issue-137-governed-may-v3-result`, which compares that file to
   the same exact bytes.

The signed scope must contain exactly:

- writable path: `docs/missions/issue-137-governed-may-proving-v3-result.md`;
- actions: `repository.run_validation`, `repository.write_file`;
- effects: `behavioral_implementation`, `verification`;
- capabilities: `filesystem_write`, `process_execute`;
- validation command: `validation:issue-137-governed-may-v3-result`;
- effect keys: the canonical cycle key and the two operation keys derived from
  the frozen descriptors, sorted and without extras.

The write target must still be absent at live preflight. The validation
executable is `/Users/ransolo/.nvm/versions/node/v24.18.0/bin/node`, observed as
`16777232:1729826:33261:120965360:1782222178000`. Any changed path, bytes,
executable identity, argument, timeout, key, root, branch, HEAD, authority,
runtime binding, review evidence, or delivery-workspace observation stops
before model invocation.

## Runtime preparation

LM Studio currently has the correct Gemma model loaded with 262,144 context,
parallelism 4, and flash attention, but its loaded identifier aliases the model
ID. Before signing the runtime binding, unload only that instance and reload
the same model with:

```text
lms load google/gemma-4-31b-qat --identifier runtime:bionic-gemma-4-31b --context-length 262144 --parallel 4 --yes
```

The host must then independently probe the API and observe model
`google/gemma-4-31b-qat` and loaded instance
`runtime:bionic-gemma-4-31b`. Failure to preserve or observe those distinct
identities stops before Wheels Up or binding.

The exact normalized operations and validation argument vector are frozen in
`docs/missions/issue-137-governed-may-proving-v3-operations.json`. The launcher
must consume those values without translation. The validator runs with the
repository root as its working directory and compares the target's bytes to
the frozen base64 value; a non-regular target or byte mismatch exits nonzero.

## Trusted host composition

Hill may materialize one ignored operational launcher below `.shield/artifacts`
from this reviewed plan. It is host orchestration, not a May-writable artifact.
Before use Hill records its SHA-256 and verifies that its dependency map uses
the production contracts directly:

- schema-9 journal read/append and permission-context loader;
- Fury evidence ledger and seat-dispatch receipt store;
- permission-audit and May control-event filesystem stores;
- `runMissionCycle`, `runMayControlLoop`, and
  `runGovernedMayDispatchStepV1`;
- host-owned Git/GitHub delivery-workspace observation, tracked-file reads,
  exact target/executable preflight, and filesystem/process probes;
- a closed Helicarrier adapter that accepts only the dispatcher-derived
  envelope and trust object, emits the reviewed blueprint bytes as the system
  prompt, and emits a manifest whose digests exactly match the trust object.

The adapter cannot widen authority or call tools. Its output is still checked
by `runHelicarrierV0` and the governed dispatcher. The launcher must expose no
retry after a durable packet claim.

## Review and execution sequence

1. Commit the mission brief, this plan, and the May blueprint without the
   result file.
2. Push the exact planning head and open one draft PR against `main`.
3. Fury reviews that exact head and blueprint. Persist only the actual verdict
   with host-observed Fury runtime/executor attribution and exact dispatch
   receipts.
4. On `FURY_PASS`, compute all three exact keys from the reviewed head and
   journal sequence; create closed Wheels Up and runtime-binding inputs.
5. Obtain the separate passcode-backed Wheels Up and May-binding signatures.
6. Invoke the production governed dispatcher once. Literal `completed` is the
   only successful fresh-run disposition.
7. Commit the exact result, run Mack validation on that revision, then return
   the same exact revision to Fury for conformance review.
8. Update #137 and leave the PR ready for human review. Stop before external
   fixture execution and #29.

## Required evidence

- exact plan and blueprint revision/digests;
- actual Fury plan-review verdict and durable attribution;
- signed Wheels Up and active May runtime binding;
- Bionic probe showing the distinct Gemma runtime identity;
- one claimed and terminal May dispatch receipt;
- exactly one write and one validation control event in order;
- exact permission-audit decisions and results for both effect keys;
- one advanced mission-cycle effect and final journal readback;
- target bytes and validation exit zero;
- Mack exact-revision validation and Fury exact-revision conformance verdict.

The result file is model-authored output, not proof by itself. Missing,
uncertain, stale, malformed, ambiguous, or conflicting evidence fails closed.
