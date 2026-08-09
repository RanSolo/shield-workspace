# Feature Flight controller

`shield-ops flight status` is the non-authoritative, effect-free controller for
the Feature Flight plan/state/status subset. Its machine identity is
`shield-feature-flight-controller` version `1.0.0`. It does not replace or
reinterpret the `shield-helicarrier.v0` compilation kernel.

## Command

```text
shield-ops flight status --plan FILE --expected-plan-sha256 SHA256 \
  --state FILE --expected-state-sha256 SHA256 --expected-state-sequence N \
  [--predecessor-state FILE --expected-predecessor-sha256 SHA256]
```

Every required option must occur exactly once. The predecessor options are
forbidden at sequence 0 and required together after genesis. The command reads
canonical absolute, existing, non-symlink regular files; validates fatal UTF-8,
exact byte digests, the closed contracts, and the supplied sequence; and emits
one JSON status document to stdout. Errors produce no JSON status document.

The controller never creates or updates state. It does not run Git, invoke a
model or seat, dispatch work, execute a command, call GitHub, mutate a journal,
or write an output file.

## Canonical contracts

- The resolved plan is closed `feature-flight-resolved-plan` schema version 1.
  `flight-contracts.mjs` is its canonical validator.
- State is closed `non-authoritative-flight-state` schema version 2.
  `flight-contracts.mjs` is its canonical validator. Genesis identifies
  `flight-state-init` version `1.0.0`; later snapshots identify
  `flight-state-successor-recorder` version `1.0.0`.
- Output is closed `shield-feature-flight-status` schema version 1.
  `feature-flight-controller.mjs` is its canonical producer.

Plan, current-state, and optional predecessor identities contain the canonical
path, exact byte count, and raw lowercase SHA-256. A non-genesis invocation
validates only the supplied immediate predecessor edge. It does not prove any
earlier edge, complete history, the globally latest state, live repository
identity, or trusted lifecycle authority.

## Stops and candidates

The projection always has `authority:"none"` and `gateEligible:false`.
Authority-derived lifecycle statuses in the current or predecessor snapshot
produce `authority-verification-required`. Current `blocked` or `failed`
statuses otherwise produce `operator-disposition-required`. With neither stop,
the first planned mission in plan order at the lowest recomputed wave, with no
declared dependencies, becomes a non-authoritative candidate to request exact
child authorization. If no such mission exists, the stop is
`no-structurally-eligible-candidate`.

`nextCandidate` is null whenever a stop exists. No result emits
`dispatch_ready`, PASS, approval, acceptance, verified authority, or permission
to perform an external effect.

## Prototype supersession

The consolidated validators supersede overlapping plan validation from the
earlier `flight-common.mjs` prototype and state/routing validation from the
earlier `flight-state-init.mjs` and `hill-kernel.mjs` prototypes. Prototype
artifacts are rejected unless their exact bytes independently satisfy these
closed consolidated contracts. Earlier review, test, or authority claims do
not transfer.
