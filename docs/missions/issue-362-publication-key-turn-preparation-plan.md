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

Normal graph-backed behavior remains byte-compatible. When and only when the
first canonical preparation result is `protected_evidence_mismatch`:

- without `--fury-model`, return the same blocked result plus a structured
  authority-none `nextAction` naming
  `mission.continue-legacy-reviewed-transition`, the exact current mission,
  and the requirement to select a Fury model;
- with `--fury-model`, invoke the existing
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
   `protected_evidence_mismatch` state. Fresh Wheels Up, runtime-binding,
   publication-ready, already-authorized, and every other blocked result never
   enter it.
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
5. At most one legacy continuation attempt and one post-materialization
   preparation replay occur per invocation. Existing seed/claim/receipt
   idempotency owns concurrent and restarted invocations.
6. The command never catches and relabels a specific legacy or preparation
   error as success. No fallback packet or manual command is generated.

## Output

Human mode remains concise:

- missing `--fury-model`: the canonical blocker plus one copy-safe next action;
- Fury REVISE or recovery: the existing closed state/code/disposition;
- successful materialization: no intermediate receipt dump; immediately show
  the existing next decision or PIN projection;
- successful authorization: the existing concise receipt.

JSON mode emits one parseable terminal object. It must not concatenate the
legacy result and preparation result. A structured `transition` field may
identify `legacy_materialized` only in the final ready/replay response; it is
advisory provenance, not authority.

## Smallest implementation inventory

May may modify only:

- `packages/shield-team-system/src/mission-cli.mts`
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
2. An exact missing-graph fixture without `--fury-model` returns one
   machine-readable, authority-none successor and performs no model, audit,
   journal, signer, Git, or GitHub effect.
3. The same fixture with `--fury-model` passes only mission ID, canonical root,
   and model to the injected legacy operation.
4. Materialized and already-materialized outcomes cause exactly one canonical
   preparation replay and then reach the existing publication decision/PIN
   path without caller JSON.
5. Fury REVISE, dispatch pending, invalid, conflict, recovery-required, thrown
   operation, and blocked second preparation produce no PIN and no second
   legacy attempt.
6. Exact retry and concurrent invocation rely on and preserve #349's existing
   one-seed/one-dispatch/one-materialization semantics.
7. A spawned real-CLI fixture reproduces the #349 manual-packet scenario and
   reaches the publication gate through `prepare-next --fury-model` without
   invoking `authorize-wheels-up --input` or `publication-authorize --input`.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- `node --test --test-name-pattern='prepare-next|legacy continuation|publication' packages/shield-team-system/tests/supervised-cli.test.mjs`
- `npm exec -- nx affected -t build test --base=d2174e32f384c1af1ec2d650ec30a4fbf8f9daec --head=HEAD --exclude=@shield/multiband`
- `git diff --check d2174e32f384c1af1ec2d650ec30a4fbf8f9daec..HEAD`

## Stop conditions

Return to Fury before implementation if this cannot be expressed as a bounded
composition in `mission-cli.mts`, if it requires any caller-authored authority
field or durable packet, if it changes #349 replay semantics, or if it requires
a path outside the two-file inventory.
