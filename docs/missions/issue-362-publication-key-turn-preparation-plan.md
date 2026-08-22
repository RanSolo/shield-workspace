# Issue #362 — clockwork publication preparation through `prepare-next`

## Exact identity

- Parent objective: #268
- Repository: `RanSolo/shield-workspace`
- Issue: #362
- Planning base: `d2174e32f384c1af1ec2d650ec30a4fbf8f9daec`
- Branch: `agent/issue-362-publication-packet`
- Mission: `mission:issue-362-publication-packet`
- Authority at freeze: planning only

## Architecture correction

Issue #349 reached draft publication only after Hill manually created a fresh
publication mission and hand-authored an `authorize-wheels-up` input. The
production validators correctly rejected unsorted effect keys and conflicting
publication meaning before the PIN.

That manual packet was unnecessary. Merged main already owns the complete
canonical path:

1. `continue-legacy-reviewed-transition` derives and Fury-reviews a protected
   transition graph for an eligible legacy mission without caller-authored
   authority fields.
2. `prepare-next` derives exact implementation or publication meaning from that
   protected graph and live mission/repository evidence.
3. `publish-reviewed` composes prepared publication authorization and
   execute-once draft delivery.

Issue #362 must not add `prepare-publication`, write an authorization packet,
invent execution identities, add a transition kind, or duplicate any of those
engines. It adds the missing clockwork composition between steps 1 and 2.

## Bounded outcome

Extend the existing command:

```text
shield mission prepare-next \
  --mission-id <id> \
  --root <canonical-root> \
  [--fury-model <model-id>] \
  [existing Guided Review and passcode options]
```

Normal graph-backed behavior remains byte-compatible. When the first canonical
preparation result is `protected_evidence_mismatch`, the existing legacy
operation receives the request only after its own new pre-effect guard proves
that the protected mission-preparation graph root is genuinely absent:

- without `--fury-model`, return the same blocked result plus a structured
  authority-none `nextAction` naming
  `mission.continue-legacy-reviewed-transition`, the exact current mission,
  and the requirement to select a Fury model;
- with `--fury-model`, invoke the guarded
  `continueLegacyReviewedTransitionV1` operation using only mission ID,
  canonical root, and the selected reviewer model;
- if the existing operation returns `materialized` or
  `already_materialized`, rerun canonical preparation once and continue in the
  same process through the unchanged `prepare-next` state machine;
- if Fury returns REVISE, dispatch is pending, or the legacy operation returns
  invalid/conflict/recovery-required, return that closed terminal result and do
  not reach a PIN;
- if the second preparation is not a canonical ready/replay state, return its
  exact blocked result without another legacy attempt.

A successful eligible publication continuation therefore flows:

```text
missing protected graph
→ exact #349 legacy derivation
→ production Fury PASS
→ durable reviewed-transition materialization
→ canonical publication_ready
→ existing Guided Review choice
→ existing publication PIN
```

No authorization JSON exists in this flow.

## Closed non-overlap and identity rules

1. The legacy bridge is attempted only for the exact first-pass
   `protected_evidence_mismatch` state. Before seed creation, claim lookup, or
   Fury dispatch, `continueLegacyReviewedTransitionV1` performs a no-follow
   inspection of the canonical `.shield/audit/mission-preparation` graph root.
   Exact `ENOENT` is the only legacy-eligible state. A directory, file, link,
   replacement, permission/IO uncertainty, malformed graph, stale graph, or
   any other existing protected evidence returns
   `PROTECTED_GRAPH_NOT_ABSENT` with no seed/model/audit effect. Fresh Wheels
   Up, runtime-binding, publication-ready, already-authorized, and every other
   blocked result never enter the legacy operation.
2. `continueLegacyReviewedTransitionV1` remains the sole eligibility,
   derivation, reviewer identity, seed, dispatch, replay, and materialization
   owner. `prepare-next` does not inspect Markdown, infer scope, construct a
   transition plan, or accept a verdict/receipt/path/runtime identity.
3. `--fury-model` selects only the actual production Fury reviewer used by the
   existing dispatcher. It is not copied into implementation authority; the
   reviewed transition graph retains the actual May model/runtime/executor
   identities derived from existing signed mission lineage.
4. Existing graph-backed publication derives base, HEAD, changed paths,
   implementation scope, publication effects, signer binding, journal
   sequence, and semantic authority through
   `resolvePreparedMissionTransitionV1`. No default branch or GitHub state is
   reconstructed by #362.
5. `--fury-model` is accepted but explicitly unused when the first canonical
   preparation result is not `protected_evidence_mismatch`; no legacy call is
   made and the ordinary result continues unchanged. This preserves replay
   after a prior invocation materialized the graph.
6. At most one legacy continuation attempt and one post-materialization
   preparation replay occur per invocation. Existing seed/claim/receipt
   idempotency owns concurrent and restarted invocations.
7. The command never catches and relabels a specific legacy or preparation
   error as success. No fallback packet or manual command is generated.

## Output

Human mode remains concise:

- missing `--fury-model`: the canonical blocker plus one copy-safe next action;
- Fury REVISE or recovery: the existing closed state/code/disposition;
- successful materialization: no intermediate receipt dump; immediately show
  the existing next decision or PIN projection;
- successful authorization: the existing concise receipt.

The closed composition table is:

| State | Human stream | JSON stdout | Exit |
| --- | --- | --- | --- |
| first result is not `protected_evidence_mismatch` | unchanged existing stream | unchanged existing object | unchanged |
| graph absent, Fury model missing | stderr: blocker plus copy-safe successor | `{schemaVersion:1,state:"blocked",reasonCode:"legacy_fury_model_required",missionId,nextAction:{authority:"none",owner:"hill",commandId:"mission.prepare-next",requiredOption:"--fury-model",humanGate:false}}` | 1 |
| protected graph not absent or legacy invalid/conflict/recovery | stderr: exact state/code/errors | exact legacy closed result | 1 |
| Fury REVISE or non-PASS completed | stderr: exact disposition and receipt if present | exact dispatch terminal result | 1 |
| dispatch pending/nonterminal | stderr: exact state/code | exact dispatch result | 1 |
| legacy operation throws | stderr: `legacy_continuation_failed` | `{schemaVersion:1,state:"blocked",reasonCode:"legacy_continuation_failed",missionId,errors:[message]}` | 1 |
| materialized/already-materialized, second preparation blocked | stderr: exact second blocker | exact second preparation result | 1 |
| materialized/already-materialized, second preparation ready/replay | no intermediate output; existing decision/result only | one existing terminal object only, with no concatenation | existing result |

All JSON objects go to stdout with no prose; human failures go to stderr.
There is no optional provenance field.

Freeze a package-internal `PrepareNextDependenciesV1` accepted by
`prepareNext`: `prepareSession` defaults to
`prepareMissionTransitionSessionV1`, and `continueLegacy` defaults to
`continueLegacyReviewedTransitionV1`. `runMissionCli` threads its existing
legacy operation plus the new preparation-session test injection into that
object. Tests assert exact call order and counts.

## Smallest implementation inventory

May may modify only:

- `packages/shield-team-system/src/legacy-reviewed-transition-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

This reviewed plan is immutable during implementation. No mission-preparation
library, authority schema, transition schema, journal event, signer, runtime
binding, publication identity/executor, GitHub adapter, package export,
dependency, lockfile, merge, deployment, release, or final-acceptance change
is allowed.

## Acceptance evidence

1. Existing graph-backed fresh Wheels Up, runtime-binding, publication-ready,
   publication-already-authorized, and blocked fixtures never call the legacy
   operation and retain existing output/exit behavior.
2. Corrupt, stale, malformed, linked, replaced, unreadable, or merely existing
   protected graph roots cause the legacy operation to return
   `PROTECTED_GRAPH_NOT_ABSENT` before seed, claim, audit, or model effects.
3. An exact missing-graph fixture without `--fury-model` returns one
   machine-readable, authority-none successor and performs no model, audit,
   journal, signer, Git, or GitHub effect.
4. The same fixture with `--fury-model` passes only mission ID, canonical root,
   and model to the injected legacy operation.
5. Materialized and already-materialized outcomes cause exactly one canonical
   preparation replay and then reach the existing publication decision/PIN
   path without caller JSON.
6. Fury REVISE, dispatch pending, invalid, conflict, recovery-required, thrown
   operation, and blocked second preparation produce no PIN and no second
   legacy attempt.
7. Call-order tests prove one initial preparation, zero-or-one legacy call,
   zero-or-one second preparation, and no intermediate JSON/prose output.
8. Exact retry and concurrent invocation rely on and preserve #349's existing
   one-seed/one-dispatch/one-materialization semantics.
9. A spawned real-CLI fixture reproduces the #349 manual-packet scenario and
   reaches the publication gate through `prepare-next --fury-model` without
   invoking `authorize-wheels-up --input` or `publication-authorize --input`.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- `node --test packages/shield-team-system/tests/legacy-reviewed-transition-v1.test.mjs`
- `node --test --test-name-pattern='prepare-next|legacy continuation|publication' packages/shield-team-system/tests/supervised-cli.test.mjs`
- `npm exec -- nx affected -t build test --base=d2174e32f384c1af1ec2d650ec30a4fbf8f9daec --head=HEAD --exclude=@shield/multiband`
- `git diff --check d2174e32f384c1af1ec2d650ec30a4fbf8f9daec..HEAD`

## Stop conditions

Return to Fury before implementation if this cannot be expressed as the
bounded four-file composition, if it requires any caller-authored authority
field or durable packet, if it weakens #349 replay semantics, or if it requires
a path outside the frozen inventory.
