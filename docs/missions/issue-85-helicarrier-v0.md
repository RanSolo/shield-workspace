# Mission Brief — Issue #85 Helicarrier Runtime Platform v0

## Objective

Define and implement the smallest deterministic Helicarrier execution kernel that consumes the immutable Deterministic Mission Compilation — Stage A Certification v1 record at commit `5fce3051d774c3315eeb86445f6d3724e630cf9b` without changing its behavior. The certification record's frozen implementation artifacts retain their internal `deterministic-mission-compilation-v2` identities; those nested identities must be verified exactly and must not be relabeled or regenerated.

## Frozen boundary

The kernel may:

- verify the certified Stage A identity and exact source/artifact digests;
- accept a host-validated structured dispatch envelope;
- verify governance, registry, compiler, renderer, target-profile, and content bindings;
- invoke the certified compiler unchanged;
- emit the deterministic prompt, provenance map, and compilation receipt;
- reject stale, substituted, incomplete, unauthorized, or mismatched inputs fail-closed.

The kernel must not create authority, interpret requirements, alter mission scope, perform reasoning, route missions automatically, or grant tool permission.

## Explicit exclusions

This mission does not implement MissionDispatchIR v1, notebooks, Mission Control, Stage B replay, Runtime Contracts changes, model execution, GitHub/merge/deployment/release authority, or Issue #100 work.

## Required evidence

Before implementation, Daisy must report exact evidence for the Stage A compiler, validator, receipts, identity bindings, replay fixtures, and isolation fixtures. Hill must map each observed artifact to an owner, contract, validation obligation, and stop condition. Fury must approve the threat boundary before May begins implementation.

## Acceptance criteria

- The kernel accepts only a complete host-validated envelope bound to the exact certified Stage A identity.
- Every relevant digest and revision is checked against the frozen certification artifacts.
- The certification identity is distinguished from, and explicitly binds, the nested compiler/renderer/experiment identities recorded by the accepted Stage A artifact set.
- Any missing, stale, substituted, malformed, unauthorized, or mismatched input returns a deterministic fail-closed result.
- Certified compiler behavior and output bytes remain unchanged.
- Prompt, provenance, and receipt outputs are content-addressed and attributable.
- No model or external side effect is invoked by the kernel tests.
- Focused adversarial tests and full workspace validation pass.
- Final Fury conformance and Fitz technical review pass before the PR is made ready for Coulson.

## Stop conditions

Stop and return to Coulson if implementation would require new authority semantics, a certification change, MissionDispatchIR v1, notebook behavior, Runtime Contracts changes, model invocation, external effects, or scope beyond this brief.

## Dependency position

Stage A Certification v1 is immutable and upstream. #100 is independent. #87 and Stage B remain downstream. This brief does not authorize either downstream work.
