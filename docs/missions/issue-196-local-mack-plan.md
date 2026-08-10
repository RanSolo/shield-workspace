# Issue #196 — governed local Mack plan

## Review identity

- Mission: `mission:issue-196-local-mack`
- Mission revision: `sha256:4Vd4CtAhothf7WD9FeFNYudLHQTsJL2mHZvLYtl4OX4`
- Subject: `github:RanSolo/shield-workspace/issue/196`
- Base revision: `82483d2ffd31fd7bb1ac7d90ed20fdb37bb69453`
- Branch: `agent/issue-196-local-mack`
- Implementation seat: May
- Intended proving runtime after merge: `runtime:lmstudio-gemma-4-31b`
- Intended proving model after merge: `google/gemma-4-31b-qat`

This mission adds a narrow governed local-runtime adapter for Mack's existing
independent validation contract. It does not complete the broader Mack seat
definition in #95, enable generic Mack implementation or repository tools,
change #149, run #149 validation, or treat a local model verdict as authority.

## Verified collision

- `ask-local.mjs` already maps `mack` to the Mack prompt and can invoke LM
  Studio, but its documented text fallback is explicitly ungoverned and cannot
  produce readiness evidence.
- `mack-validation-v0.mts` provides a closed exact-revision non-authoritative
  report contract, but it carries no observed runtime identity or host-derived
  command receipts.
- `local-tool-broker.mjs` already proves a unique loaded LM Studio instance at
  `/api/v1/models`, but its repository tools are the Daisy/May path and do not
  authorize Mack or process execution.
- `seat-dispatch-receipt-v1.mts` provides reusable runtime/seat identity
  semantics, but no Mack-specific composition currently binds those identities
  to validation lanes and an exact repository HEAD.
- `AGENTS.md` permits local Daisy and May only. Mack is a canonical seat but
  remains disabled for generic V0.3 dispatch; that broader enablement belongs
  to #95.

## Frozen implementation

### 1. Add a closed local-Mack validation envelope

Add `src/mack-local-validation-v1.mts` as an internal additive contract around
the existing `mack.validation.v0` report. The input and resulting evidence bind:

- literal seat `mack`;
- mission, subject, repository, canonical root, attached branch, and exact
  artifact revision;
- a Hill-frozen, non-empty ordered scenario list and validation-lane plan. Each
  lane freezes command ID, canonical executable identity, argv, canonical
  working directory, timeout, bounded environment, required flag, and explicit
  scenario mapping;
- one explicit local model selector, one host-observed loaded runtime instance,
  and one distinct tool-executor identity;
- immutable host command receipts containing command ID, executable identity,
  argv, start/end timestamps, exit code or signal, timeout/launch state, and
  bounded stdout/stderr digests rather than model-reported command outcomes;
- mission revision, unique validation request ID, canonical request digest,
  base revision, artifact revision, normalized repository identity, canonical
  worktree root and Git directory, attached branch, and the ordered
  implementation path set derived by Git between base and artifact revisions;
- pre- and post-run Git observations proving the same canonical identities,
  clean porcelain status, and implementation path set;
- prompt and response SHA-256 digests plus bounded provider counters;
- a strict model-analysis candidate containing only scenario assessments,
  classified findings, limitations, and a recommended route. It cannot contain
  assurance kind, mission/repository/revision/runtime identities, validation
  outcomes, evidence references, or final status.

The host constructs the final unchanged `mack.validation.v0` report. Binding
fields, ordered scenario IDs/required flags, ordered lane/command IDs, evidence
references, and lane outcomes come only from the frozen request and host
observations. Scenario coverage is derived from the frozen scenario-to-lane
  mapping: every required scenario must map to at least one required lane; each
  lane mapping must be non-empty, duplicate-free, and reference only frozen
  scenario IDs; optional lanes cannot establish required-scenario coverage;
  and all mapped required lanes must pass. Model assessment may veto but never
  establish coverage. `production_defect`, `test_defect`, and
`coverage_gap` findings block PASS; environment or architecture uncertainty
routes to Daisy or Fury and remains ineligible. Final status and route are
host-derived. Before invoking `evaluateMackValidationV0`, the wrapper requires
exact ordered non-empty equality with the frozen scenario and lane plans.

A model-supplied `pass`, command result, runtime identity, repository identity,
or revision can never override host observations. PASS eligibility requires
every required scenario covered, every required lane completed with exit code
zero and no signal/timeout/truncation/launch ambiguity, exact report binding,
unchanged workspace observations, one exact runtime instance, complete
digest-verified untruncated context, and no blocking Mack finding. Missing,
malformed, stale, reordered, duplicate, ambiguous, or mixed identity evidence
fails closed.

The result remains `authority: non_authoritative`. Mack cannot produce Fury,
Coulson, Fitz, Simmons, merge, deployment, release, or final-acceptance state.

### 2. Add one host runner for local Mack

Add `scripts/model/mack-validation-runner.mjs`. It accepts one closed JSON
packet and an injected or configured command registry; arbitrary shell text is
not accepted from the packet or model.

The runner must:

1. validate the packet before host access and canonicalize its request digest;
2. prove a loopback LM Studio endpoint and exactly one loaded model/runtime
   using a new generic metadata probe in `local-tool-broker.mjs`. The probe
   returns fixed provider `lmstudio`, canonical origin, observed model key, and
   sole matching loaded instance without requiring tool capability. Existing
   `probeLocalToolModel` behavior remains unchanged by layering its tool check
   over the generic probe;
3. observe canonical root, top level, attached branch, exact HEAD, clean
   porcelain status, and changed paths;
4. require the trusted command registry to exact-match every frozen command
   definition, then execute those commands in order without a shell, with the
   frozen working directory, bounded environment, timeout, and output limits;
5. send Gemma a bounded read-only review packet containing the exact mission
   binding, acceptance scenarios, approved diff/context, and host-derived lane
   summaries; no repository or process tools are advertised;
6. derive implementation diff and repository source context directly from the
   bound base/artifact Git objects, byte-compare any supplied repository
   context against those objects, then hash it. Separately frozen mission
   artifacts remain digest-verified. Reject missing, truncated, substituted, or
   other-revision context for PASS;
7. pin `/api/v1/chat`, exact observed instance ID, `store: false`, no tools,
   timeout/output limits, and deterministic decoding configuration; require one
   strict JSON model-analysis candidate and reject prose, duplicate keys,
   unknown fields, or provider identity substitution;
8. probe model/runtime metadata again immediately after inference and require
   exact equality with the pre-inference observation;
9. repeat the complete Git observation after inference;
10. construct the v0 report host-side, evaluate it, and emit one canonical
    local-Mack evidence object.

The runner must never write repository files, accept model-requested commands,
persist chain-of-thought, expose API tokens, or silently fall back to
`ask-local`. Provider reasoning may be discarded; only the final closed report
is evidence.

The runner uses a distinct executor identity such as
`executor:local-mack-validation-v1`; the LM Studio runtime instance and model
remain separately attributed.

Evidence is eligible only for its current validation request ID and request
digest. An identical duplicate may replay idempotently; a prior request or
conflicting same-ID evidence is ineligible. Only the production runner's real
Git, process, clock, and fetch operations can mark evidence production-eligible.
Dependency-injected tests always produce explicitly synthetic, ineligible
evidence.

### 3. Routing and documentation

Update `AGENTS.md` so Mack may use a local runtime only through this governed,
read-only, exact-revision validation path. Hosted Mack remains supported. A
local model is the Mack executor, never the seat or an authority source.

Update the Mack agent card and model README with the exact output boundary,
operator configuration, failure semantics, and the distinction between this
governed runner and ungoverned `ask-local` fallback.

Do not add Mack to generic V0.3 mission participants, implementation authority,
May runtime binding, repository tools, or process tools. Those changes remain
in #95 or a later independently authorized slice.

### 4. Tests

Add focused coverage proving:

- exact LM Studio provider/model/runtime/executor attribution and identity
  separation, including pre/post inference probe equality;
- host receipts, not model prose, derive lane outcomes and pass eligibility;
- stale HEAD, branch/root drift, dirty worktree, changed paths, runtime
  ambiguity, wrong model, non-loopback endpoint, command substitution,
  nonzero exit, signal, timeout, launch failure, output truncation, malformed
  JSON, duplicate keys, and unknown fields fail closed;
- required scenarios and command order cannot be omitted, duplicated, or
  reordered;
- every required scenario has at least one required-lane mapping; empty,
  duplicate, unknown-scenario, or optional-only mappings are rejected;
- command-ID rebinding, executable/argv/cwd/environment/timeout drift,
  stale request IDs/digests, conflicting replay, incomplete or digest-mismatched
  context, internally consistent context from another Git revision, and
  synthetic test evidence cannot become eligible;
- model-supplied PASS cannot override failed or unavailable host evidence;
- no repository write or model-selected process execution is possible;
- existing `mack.validation.v0`, hosted Mack routing, Daisy/May local adapters,
  and V0.3 role enablement remain unchanged;
- the Mack prompt, `AGENTS.md`, and README agree on the local-runner boundary.

## Exact writable paths

1. `AGENTS.md`
2. `packages/shield-team-system/agents/alphonso-mack-validation.agent.md`
3. `packages/shield-team-system/scripts/model/README.md`
4. `packages/shield-team-system/scripts/model/mack-validation-runner.mjs`
5. `packages/shield-team-system/scripts/model/local-tool-broker.mjs`
6. `packages/shield-team-system/src/mack-local-validation-v1.mts`
7. `packages/shield-team-system/tests/agent-boundaries.test.mjs`
8. `packages/shield-team-system/tests/local-tool-broker.test.mjs`
9. `packages/shield-team-system/tests/mack-local-validation-v1.test.mjs`
10. `packages/shield-team-system/tests/mack-local-runner.test.mjs`

The contract remains internal to the runner; this slice adds no public package
export.

If the implementation requires changing role taxonomy, config, mission
journals, permission authority, `ask-local`, Daisy/May tool definitions,
session behavior, executor semantics, #149 artifacts, or any other path, return
to Fury instead of widening scope. The only authorized shared-broker change is
the additive generic metadata-probe refactor that preserves existing
`probeLocalToolModel` and Daisy/May behavior exactly.

## Validation

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/mack-local-validation-v1.test.mjs
node --test packages/shield-team-system/tests/mack-local-runner.test.mjs
node --test packages/shield-team-system/tests/agent-boundaries.test.mjs
node --test packages/shield-team-system/tests/local-tool-broker.test.mjs
node --test packages/shield-team-system/tests/mack-validation-v0.test.mjs
node --test packages/shield-team-system/tests/model-harness.test.mjs
node --test packages/shield-team-system/tests/role-taxonomy-v1.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

Mack cannot validate this capability through itself before merge. The exact
implementation revision therefore requires May/host implementation checks,
hosted Fury conformance, and the existing human gate. The first post-merge
Gemma run is the proving run; any failure blocks #149 resumption and cannot be
reclassified as PASS. Only a successful proving run may supply #149's
independent Mack evidence.
