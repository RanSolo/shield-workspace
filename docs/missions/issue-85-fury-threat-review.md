# Fury Threat Review — Helicarrier v0

## Verdict

**PASS WITH BOUNDARIES.** The bounded execution-kernel slice may proceed if May implements an injected host adapter and does not copy, recompile, mutate, or silently relabel the certified compiler.

## Threat decisions

### Certification substitution

The adapter must require the certification record identity (`Stage A Certification v1` at commit `5fce3051d774c3315eeb86445f6d3724e630cf9b`) and independently verify the nested frozen experiment/compiler/renderer identities recorded by that certification. A v1/v2 label mismatch must fail closed rather than be normalized.

### Receipt forgery or replay

The kernel must accept public key, counter, revocation, and current-authorization state only from an injected trusted host. It must call the certified receipt verifier and reject missing, malformed, expired, revoked, substituted, or cross-dispatch receipts. It must not mint authority or treat replay identity as permission.

### Compiler drift

The certified compiler must be an injected exact implementation with an identity binding. The Helicarrier adapter must not reimplement rendering, read source files to “repair” the compiler, or import mutable experiment sources as an implicit dependency.

### Governance bypass

The adapter may verify a host-issued validated envelope but may not assemble IR, interpret prose, select a seat, expand scope, or replace the Mission Journal. Host authorization remains a precondition and is never inferred from the envelope alone.

### Output tampering

The adapter must return the certified prompt, provenance, and manifest bytes without rewriting them. Any output identity mismatch or failed receipt/output binding is an uncertain fail-closed result.

### External effects

The v0 kernel must perform no model call, repository mutation, network call, GitHub action, merge, deployment, release, or runtime replay. Tests must prove this boundary.

## Required implementation shape

- Pure or side-effect-free adapter around injected certified compiler/verifier functions.
- Explicit `certificationIdentity` and nested frozen identity bundle.
- Explicit host trust/authorization input.
- Deterministic success and failure result shapes.
- No import of mutable benchmark source into production runtime.

## Review gate

May may implement only this shape. Any need for new authority semantics, new certification artifacts, model/runtime dispatch, notebook behavior, or production integration returns the mission to Coulson.

## Final conformance

**PASS** for the reviewed implementation shape. The adapter is side-effect-free, requires the fixed certification and nested identities, invokes validation before compilation, copies output bytes, emits deterministic digest receipts, and converts callback failures into closed results. No model, repository, GitHub, merge, deployment, or release path is present.
