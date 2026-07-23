# Hill Plan — Helicarrier v0 Certified Execution Kernel

## Ownership

- Hill: orchestration, readiness, scope and stop-condition evaluation.
- Daisy: evidence-only reconnaissance; no edits or implementation recommendations beyond observed seams.
- Fury: adversarial threat review and final conformance authority.
- May: sole implementation owner after Fury approval.
- Fitz: final technical review after Fury conformance.
- Coulson: authorization and merge decision.

## Smallest vertical slice

Add a host-facing Helicarrier kernel adapter around the certified Stage A compiler. It accepts a structured validated envelope plus explicit host trust/authorization inputs, verifies the certification and nested artifact identities, calls the certified compiler unchanged, and returns deterministic output bytes plus a receipt-bound execution result.

The adapter must not reconstruct candidate IR, parse Markdown, call a model, discover authority, read mutable repository state, or perform external effects.

## Host-owned inputs

- exact certification commit and freeze-manifest identity;
- exact frozen digest bundle for compiler source, validator source, renderer specification, registry artifact, and target profile;
- trusted public key and revocation/counter state;
- current authorization and governance binding;
- validated dispatch envelope and receipt;
- expected nested compiler, renderer, registry, target, fixture, context, and source-tree digests.

Missing or inconsistent host inputs fail closed.

## Validation obligations

- certification record and nested v2 identities match exactly;
- every frozen source/artifact digest in the certification bundle matches the validated compiler identity;
- envelope is structurally closed and receipt verifies;
- all content/governance/registry/renderer/target/fixture/context digests match;
- compiler and validator identities are not substituted;
- deterministic prompt, provenance, and manifest bytes are unchanged;
- output receipt binds the exact dispatch and output identities;
- no model or external side effect occurs.

## Stop conditions

Return to Coulson if the implementation needs new authority semantics, a new certification, IR v1, notebook behavior, replay execution, model invocation, mutable repository access, external communication, or changes to the certified compiler/artifacts.
