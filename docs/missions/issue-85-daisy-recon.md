# Daisy Reconnaissance — Issue #85

## Gate

Evidence-only reconnaissance completed against the supplied Stage A artifacts. No implementation was performed.

## Direct evidence

- `benchmarks/deterministic-mission-compilation/src/compiler.ts` exposes `compileDispatch` and deterministic output identity helpers. It validates a structured envelope, verifies a receipt, renders canonical output, and emits prompt, provenance, and manifest bytes.
- `benchmarks/deterministic-mission-compilation/src/validator.ts` issues and verifies signed validation receipts with digest bindings, governance sequence, counter expiry, and revocation checks.
- `benchmarks/deterministic-mission-compilation/src/contracts.ts` defines closed v0 IR, validated envelope, receipt, trust, and host-observation shapes.
- `docs/validation/deterministic-mission-compilation-stage-a-result-v2.json` records the accepted Stage A result at source revision `8a0543bf5ae7e2c190f94e94e7336fb8b4399304`, with 25 artifact bindings, 3 semantic bindings, 0 failed identity checks, and preserved v0/failed-v1 evidence.
- `docs/validation/deterministic-mission-compilation-stage-a-freeze-v2.json` binds the exact v2 experiment, renderer, runtime-envelope, target-profile, source-tree, and artifact identities.
- The protocol and result record describe replay isolation, but no reusable Helicarrier isolation implementation was found in the supplied context.

## Reconciliation

The phrase “Stage A Certification v1” names the immutable certification record accepted at `5fce3051d774c3315eeb86445f6d3724e630cf9b`. Its frozen nested implementation artifacts retain the `deterministic-mission-compilation-v2` identities. The Helicarrier must verify both layers and must not rename or regenerate the nested artifacts.

## Missing or host-owned seams

- The pinned verification key and revocation source are host trust inputs, not present in the benchmark source.
- Replay/isolation fixtures are described by protocol and result evidence but are not a production Helicarrier interface.
- The kernel must receive these trust and authorization inputs from a trusted host; it must not invent them or infer them from model output.

## Fail-closed risks

1. Confusing the certification record identity with its nested v2 compiler identity.
2. Accepting a receipt without host-provided key, counter, authorization, and revocation state.
3. Treating protocol prose as an executable replay/isolation implementation.
4. Reimplementing or mutating the certified compiler instead of invoking it unchanged.

## Daisy recommendation

Resolve the two-layer identity mapping in the Mission Brief, keep trust and replay inputs as explicit host-owned dependencies, and require Fury review before implementation.

