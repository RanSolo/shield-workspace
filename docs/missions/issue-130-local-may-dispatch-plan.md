# Mission #130 PR A — Hill implementation plan

Status: proposed for Fury architecture review; no implementation authority

Plan source baseline: `23dda41`; Fury must review the later exact commit that
contains this plan.

## Outcome

Add a read-only `shield mission dispatch` preflight for one local May cycle. A
successful result is only a compiled, non-authoritative handoff candidate with
state `dispatch_ready`; it does not call LM Studio, execute a tool, append a
journal or audit record, or claim that May was dispatched.

## Exact command

```text
shield mission dispatch \
  --mission-id <id> \
  --seat may \
  --runtime local \
  --packet <repository-relative-json-file> \
  [--root <path>] \
  [--json]
```

`may` and `local` are the only accepted V1 values. The packet must resolve to a
regular file inside the canonical repository root; symlinks in either the file
or its ancestor path fail closed.

## Closed packet contract

Add `src/local-may-dispatch-v1.mts` with a strict plain-object validator for:

```ts
interface LocalMayDispatchPacketV1 {
  schemaVersion: 1;
  packetId: string;
  missionId: string;
  planRevisionId: string;
  scopeRef: string;
  requestedWork: string;
  artifactRefs: string[];
  validationCommandIds: string[];
  outputContract: string;
  stopCondition: "after_one_cycle";
}
```

Strings and collections receive explicit bounds, identifiers use existing
repository conventions, duplicates and unknown fields fail closed, and
artifact refs are safe repository-relative paths. `artifactRefs` and
`validationCommandIds` are requests only. They cannot authorize a path,
executable, argument, capability, runtime, or publication effect.

The module also validates a closed `LocalMayDispatchScopeV1` artifact containing
the mission, subject, mission revision, plan revision, repository, branch, base
revision, action ID, effect class, effect key, approved files, approved
validation command IDs, output contract, and fixed stop condition. The scope is
explicitly non-authoritative. Its effect key must equal the canonical digest of
the scope body excluding the `effectKey` field, and that exact effect key,
action, effect class, and required capabilities must all be present in the
Coulson-authorized active runtime binding. The packet's requested files and
validation IDs must be subsets of this scope, and its output contract and stop
condition must exactly match the scope. `scopeRef` therefore selects an
already-authorized scope; it cannot broaden one.

## Trusted preflight input and compiled result

The same module exposes one pure compiler. Its trusted-host input contains the
validated packet plus:

- repository ID, canonical root, observed branch, exact Git HEAD, and observed
  dirty paths;
- the replayed mission projection and journal sequence;
- the current exact review subject and one Fury approval for
  `packet.planRevisionId`;
- the single active May runtime binding, including runtime and executor IDs and
  approved action/effect/capability scope;
- the regular-file dispatch scope selected by `packet.scopeRef`, whose digest is
  bound to the active runtime binding's authorized effect key;
- pipeline-profile command bindings resolved by command ID;
- package-owned shared runtime instructions and exact May seat prompt;
- fixed `seatId=may`, `runtimeKind=local`, tool definitions, output contract,
  and `after_one_cycle` stop condition.

The compiler validates all cross-bindings. It returns either:

- `{ state: "dispatch_ready", authority: "non_authoritative", ... }` containing
  a closed SHIELD context block, the composed system prompt, the composed user
  prompt, scope-approved files, and resolved validation command definitions; or
- `{ state: "blocked", authority: "non_authoritative", reasonCode }` with one
  stable reason and no model/tool side effect.

The SHIELD context explicitly binds mission and subject IDs, mission and plan
revisions, journal sequence, repository/root/branch/HEAD, authorization state,
Fury review ID, seat/runtime/model/executor identity, approved capabilities,
approved files, resolved validation command IDs, available tool names, output
contract, and stop condition. The packet is serialized as untrusted requested
work in a separate user-prompt section; it is never merged into authority
fields.

## Fail-closed rules

Return stable blocked reasons for malformed packet, mission mismatch,
unauthorized or non-ready mission, stale/missing Fury approval, missing or
ambiguous May binding, root/repository/branch/HEAD mismatch, dirty paths outside
the authorized dispatch scope, scope digest/effect-key mismatch, requested
artifacts outside dispatch scope, packet/scope output mismatch, unknown or
unapproved validation IDs, stale pipeline profile, and prompt asset read
failure. Evaluate all of these before constructing `dispatch_ready`.

`baseUrl`, API token, live model probe, session ID, clocks, audit adapters,
permission callbacks, temporary-name generation, and every
`MayControlLoopDependencies` callback remain PR B-only. PR A must not construct
or invoke `MayControlLoopRequest`.

## CLI composition

Update `src/mission-cli.mts` to:

1. parse only the exact command above;
2. open the root and packet read-only with canonical containment checks;
3. load and replay existing SHIELD config and mission journal contracts;
4. obtain branch, exact HEAD, and NUL-delimited dirty paths through fixed Git
   argv and a scrubbed Git environment;
5. load the selected dispatch scope, repository pipeline profile, and
   package-owned prompt assets as regular, non-symlink files;
6. call the pure preflight compiler and print its result;
7. return zero only for `dispatch_ready`, one for a valid blocked result, and
   two for malformed CLI usage.

No executable or argument comes from the packet. The compiler resolves requested
validation IDs only against the validated pipeline profile. No filesystem write
API is added to this path.

## Files and tests

- Add `src/local-may-dispatch-v1.mts`.
- Update `src/mission-cli.mts` and its usage text.
- Add `agents/shared-runtime.agent.md` from the preserved human-supplied text;
  load it and the existing `agents/melinda-may-implementer.agent.md` relative to
  the installed package, not from the caller's working directory.
- Add `tests/local-may-dispatch-v1.test.mjs` for the pure contract.
- Extend `tests/supervised-cli.test.mjs` for packed CLI behavior and byte-for-byte
  journal, audit, and workspace immutability.
- Update `PUBLIC_API.md` only to document the command as preflight; do not add a
  new public JavaScript export in PR A.

Focused cases: ready fixture; malformed/extra packet fields; packet/mission
mismatch; missing authorization; stale HEAD; stale or missing Fury gate;
ambiguous runtime binding; path traversal and symlinked packet/ancestor;
scope digest/effect-key mismatch; out-of-scope dirty path; unapproved artifact;
unknown command ID; injected executable-like command ID; stale pipeline
profile; and explicit proof that no
model endpoint, tool executor, or append callback is reachable.

## Stop condition

Stop after the exact PR A implementation revision passes focused tests and Fury
conformance review. Do not begin PR B, invoke local May, push, open a PR, mark a
PR ready, merge, deploy, or release under this plan.
