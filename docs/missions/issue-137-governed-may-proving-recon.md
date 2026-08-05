# Issue #137 governed May proving reconnaissance

## Exact context

- Mission: `mission:issue-137-governed-may-proving`
- Signed mission revision: `sha256:2Rvv2DmF2XRhWFCoUqHQg-m40zn_7iBgwb9MGfxBaPk`
- Repository revision: `de6ad4cbbd66d5ad9576c2d22103a413d9d2d1c1`
- Runtime under evaluation: local LM Studio `google/gemma-4-31b-qat`
- Authority: signed supervised mission authorization and exact-revision Wheels Up
- Boundary: no external fixture run, issue #29, merge, deployment, or release

## Observed host evidence

1. `shield mission begin` and `shield mission authorize` created and signed a
   schema-2 supervised journal for this mission. The journal replays as
   governance approved and execution ready under the supervised CLI surface.
2. `runGovernedMayDispatchStepV1` rejects every journal whose display kind is
   not `profile-aware`. Its exact result is `recovery_required`, readiness
   `indeterminate`, code `schema_unsupported`, before Fury evidence, packet
   claim, model invocation, or tool effects.
3. The shipped `mission begin` command validates only a supervised mission
   brief and initializes only the supervised schema plane. It has no
   profile-aware schema-9 begin or authorization route.
4. Issue #181 added the signed schema-9 implementation-authority and May
   runtime-binding producers, but explicitly excluded mission-runtime and CLI
   wiring. The profile-aware library producers therefore exist without a
   supported operator path that can turn the signed supervised routine into
   the journal consumed by the governed dispatch step.
5. Reusing the schema-2 Coulson signature, conversational Wheels Up text, a
   host assertion, or fixture data as schema-9 authority would reinterpret
   evidence across schema planes and violate the current trust model.

## Local Daisy evidence

The original stateless packet supplied 62,237 input tokens of plan, source,
tests, blueprint, and public API context. After the LM Studio context was
reloaded to its large setting, the request remained open for 900 seconds and
returned no response bytes. It is recorded as an oversized operationally
unsuccessful packet; no model conclusion or token statistics are claimed.

A focused follow-up packet supplied the CLI, governed-dispatch, profile-aware
producer, and prerequisite-plan excerpts. Gemma returned `true prerequisite
product gap`, citing the exact schema check and absent CLI route. Host-observed
statistics were 7,445 input tokens, 942 reasoning tokens, 1,260 total output
tokens, 12.254 tokens/second, and 65.029 seconds to first token.

## Disposition

The requested exact-bound May packet cannot be dispatched honestly from the
currently signed mission. This is a pre-effect fail-closed blocker, not a May
implementation failure. A separately scoped child mission must add a supported
profile-aware initiation/signing path or another explicitly reviewed host
composition using the existing schema-9 contracts. This mission must not mint
that authority, reinterpret the schema-2 signature, invoke May, or claim that
the bridge proving criteria passed.

