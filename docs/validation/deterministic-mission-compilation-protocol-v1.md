# Deterministic Mission Compilation Protocol v1

This protocol defines a new candidate and does not amend or supersede v0.

## Candidate identities

- experiment: `deterministic-mission-compilation-v1`
- trial: `stage-a-trial-002`
- IR: `mission-dispatch-ir.v1`
- validation envelope: `validated-dispatch.v1`
- validator: `shield-dispatch-validator@0.2.0-experiment`
- compiler: `shield-compiler@0.2.0-experiment`
- renderer: `canonical-chat-v2`
- control artifact: `human-control-handoff.v1`
- control assembler: `shield-control-assembler@0.1.0-experiment`
- assembly specification: `control-assembly.v1`
- shared instruction set: `shared-runtime-instructions.v1`
- common wrapper: `common-runtime-wrapper.v1`
- runtime message envelope: `runtime-message-envelope.v1`
- instruction registry: `shield-dispatch-registry.v1`
- target profile: `codex-text.v1`
- provenance: `dispatch-provenance.v1`
- deterministic manifest: `compilation-manifest.v1`
- receipt: `dispatch-validation-receipt.v1`

Every identity above is immutable after the v1 freeze. A correction requires a
new identity and a complete Stage A restart.

## Control source artifacts

The control prompt is constructed from exactly three opaque UTF-8 artifacts in
this fixed order:

1. `control:fury-finding-41-v1`
2. `control:coulson-authorization-41-v1`
3. `control:validation-and-output-41-v1`

Their bytes are frozen individually with domain-separated SHA-256 digests.
The assembler does not parse, summarize, normalize, trim, or reinterpret them.

## Assembly grammar

The control prompt is the byte concatenation:

`OPEN || artifact[0] || BETWEEN || artifact[1] || BETWEEN || artifact[2] || CLOSE`

The exact delimiter bytes are:

- `OPEN`: `# Human-authored May handoff v1\n\n`
- `BETWEEN`: `\n--- SHIELD GOVERNED ARTIFACT BOUNDARY ---\n\n`
- `CLOSE`: `\n--- END HUMAN-AUTHORED HANDOFF ---\n`

All literal strings are UTF-8 and use LF. Source bytes are preserved exactly,
including their existing terminal newlines. The assembler adds no other byte.
The ordered artifact-ID list, individual source digests, delimiter-byte
digests, assembly-specification digest, complete control-prompt bytes, byte
length, and control-prompt digest are frozen.

## Shared runtime instructions and wrapper

Both arms receive byte-identical shared runtime instructions. They establish
only operational replay conditions already authorized by the benchmark:

- the accountable and artifact-owning seat is May;
- work is confined to the bound isolated repository at the exact base commit;
- no network, parent workspace, opposite arm, accepted artifact, or sealed
  grading output may be accessed;
- only the approved three-file repair may be attempted;
- all listed validation and stop conditions apply;
- the runtime must report changed files, validation, and unresolved risks;
- prompt text describes authority but creates none.

The common wrapper is a separate content-addressed byte artifact. It identifies
the experiment, trial, accountable seat, authority disclaimer, and the digest
of the shared instruction set. It must be byte-identical across arms.

## Runtime message envelope

The transport-neutral envelope is canonical JSON encoded as UTF-8 with exactly
two ordered messages:

1. `system`: `common-wrapper-bytes || shared-instruction-bytes`
2. `user`: the arm-specific prompt bytes

The schema admits no unknown properties. Message order, role strings,
concatenation boundary, Base64 encoding, target-profile digest, wrapper digest,
shared-instruction digest, and arm-prompt digest are closed fields. The
envelope contains the exact message bytes as Base64, not reconstructed text.

Control and compiled envelopes have separate domain-separated digests. No
runtime adapter may prepend, append, merge, normalize, or otherwise alter a
message after freeze. Any provider-required addition would require a new
target profile, identity, Stage A restart, and renewed review.

## Compiled arm

The compiler accepts only a host-validated structured dispatch envelope with a
valid receipt bound to its exact IR and governance digest. It performs no
reasoning, authority decision, Markdown parsing, filesystem access, network
access, clock read, environment read, or model invocation.

For identical validated content, registry, renderer, compiler, and target
profile, it emits byte-identical compiled prompt, provenance map, and
deterministic manifest. The complete compiled prompt bytes and digest are
frozen before Stage A measurement.

## Content addressing

All digests use SHA-256 with frozen domain tags and the grammar:

`domain-tag UTF8 || uint64be(payload-byte-length) || payload-bytes`

Separate domain tags apply to source artifacts, delimiters, assembly specs,
control prompt, compiled prompt, shared instructions, common wrapper, message
envelopes, IR, governance, registry, renderer, target, provenance, manifest,
receipt, source tree, compiled artifact, and experiment identity. Cross-domain
substitution fails closed.

## Required v1 mutations

In addition to every applicable v0 validation, receipt, provenance, scope, and
determinism mutation, v1 must reject:

- reordered, missing, duplicate, or extra control source artifacts;
- changed artifact bytes or artifact digest;
- changed opening, boundary, or closing delimiter;
- trimming, Unicode normalization, line-ending change, or terminal-newline
  change;
- changed assembly grammar or control assembler identity;
- changed control-prompt bytes, digest, or byte length;
- changed shared instruction or wrapper bytes, identity, order, or digest;
- changed runtime message count, order, role, bytes, target, or digest;
- an arm-specific wrapper or shared instruction;
- any runtime-added prefix, suffix, or provider message;
- changed compiled-prompt bytes or digest after freeze; and
- any attempt to reuse a v0 identity or combine v0 and v1 results.

Every mutation must return its specific closed error.

## Measurement and freeze sequence

1. Construct v1 source and tests before the freeze.
2. Commit the immutable v1 source candidate.
3. Build and validate it from a clean Git archive.
4. Generate and commit a v1 freeze manifest binding every source, binary,
   dependency, control, prompt, wrapper, message, protocol, fixture, isolation,
   rubric, and governance identity.
5. Extract the frozen revision independently and rerun the complete Stage A
   matrix without edits.
6. Record v1 results separately from v0 and return the exact evidence revision
   to Fury.

The freeze occurs after construction and before measurement. Results produced
before the freeze are construction evidence only.

## Stage B gate

Stage B remains stopped unless Stage A v1 passes unchanged, Fury approves the
exact frozen evidence revision, the trusted host revalidates the retained
isolated repositories, and current Coulson authorization and governance state
remain valid immediately before dispatch. No model invocation is part of
Stage A.

