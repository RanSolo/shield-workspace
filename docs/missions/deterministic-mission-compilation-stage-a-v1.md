# Mission Brief: Deterministic Mission Compilation Stage A v1

Status: Wheels Up for Stage A construction only

## Objective

Construct and measure a new, independently identified Stage A candidate that
closes the v0 control-arm assembly gap. The candidate must prove that both
benchmark arms are fully specified before any runtime replay: the compiled arm
by deterministic compilation and the control arm by deterministic assembly of
content-addressed human handoff artifacts.

The accepted v0 Stage A result remains immutable evidence. V0 and v1 results
must never be combined.

## Frozen experimental boundary

The v1 freeze must bind all of the following as first-class artifacts:

- compiler, validator, renderer, registry, target profile, fixture, and
  governance identities;
- exact control source artifacts and their order;
- exact control concatenation grammar, separators, delimiters, encoding, and
  terminal-newline rule;
- exact assembled control-prompt bytes and digest;
- exact compiled-prompt bytes and digest;
- the common runtime wrapper and all shared runtime instructions;
- the ordered runtime message-envelope specification;
- the complete control and compiled runtime-envelope bytes and digests;
- isolation, grading, and stop-condition contracts.

No component may parse Markdown. Human handoff artifacts are opaque bytes to
the control assembler. The compiler continues to accept only a validated,
structured dispatch envelope.

## Authorized work

- Add a separate v1 experiment package without modifying v0 artifacts.
- Construct the v1 control assembler, validator, compiler, renderer, fixtures,
  static checks, and Stage A tests.
- Create an immutable source commit, freeze manifest, and measurement result.
- Reverify the retained replay repositories as clean, base-only, mutually
  inaccessible, and free of the historical accepted commit and tree.
- Return the exact frozen identity and complete Stage A evidence to Fury.

## Prohibited work

- No May or other implementation-model invocation.
- No Stage B dispatch or grading.
- No production package integration.
- No merge, release, deployment, or roadmap expansion.
- No modification or replacement of the v0 protocol, source, freeze, or result.

## Stage A gates

Stage A v1 passes only if:

1. all v1 construction and mutation tests pass;
2. static compiler and control-assembler closure checks pass;
3. repeated fresh-process construction produces byte-identical compiled
   prompt, control prompt, provenance, deterministic manifest, common wrapper,
   and both runtime envelopes;
4. every frozen identity check passes from a clean source archive;
5. post-freeze mutation of either arm, shared instructions, wrapper, envelope,
   ordering, separator, or digest fails closed;
6. the repository production suites remain green; and
7. Fury confirms conformance at the exact evidence revision.

Passing Stage A does not itself dispatch Stage B. Immediately before any later
dispatch, the trusted host must revalidate the frozen identity, isolation,
current Coulson authorization, and current governance state.

