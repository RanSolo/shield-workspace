# Issue #171 Slice C reconnaissance

## Evidence identity

- Mission: `mission:issue-171-slice-c`
- Mission revision: `sha256:4mTZkKHEO8g_duezUYanuU0U1rPHbG2vTrHB-IVVhEw`
- Repository revision inspected: `963e6f9f8edb9280e96bd42298ac306cd82513fb`
- Authority: planning and read-only reconnaissance only
- Model invocation: prohibited

## Observed trust boundary

1. Schema-9 replay in `profile-aware-mission-v1.mts` is now the canonical source
   of `implementationAuthority`, its active/revoked state, and
   `activeRuntimeBindings`. The merged #181 contracts bind authority and May
   binding to mission, subject, repository, canonical root, branch, artifact,
   base and head revisions, runtime/model, executor, paths, validation commands,
   actions, effects, and capabilities.
2. `permission-v1.mts` already accepts journal schema 9 and evaluates a closed
   `PermissionInvocationContext`, but it does not construct one. Its evaluator
   requires exactly one active May binding plus one fresh repository-root
   attestation, one fresh writability attestation, and one fresh attestation for
   each required capability.
3. `mission-runtime-v1.mts` owns the pre-effect permission seam through
   `getPermissionContext`. It validates the returned context before the audited
   claim and executor paths, but the callback remains host-supplied and can
   currently return caller-assembled authority data.
4. `mission-store.mts` already reads the durable mission JSONL, rejects mixed
   schema journals, replays schema 9, and returns the validated profile-aware
   projection. It is the production filesystem source Slice C can consume.
5. The May executor independently rechecks canonical root identity, workspace
   revision, and changed paths around effects. That protection remains intact,
   but it does not replace construction of an authority-backed permission
   context.
6. Existing Git-backed workspace observation demonstrates the repository
   convention: resolve the live top-level root, canonicalize it, and read the
   current branch and `HEAD`. No core permission-context loader currently owns
   that observation.
7. Permission-audit and May control-event stores are durable downstream evidence
   sinks. Neither may authorize a binding or repair missing schema-9 authority.

## Architecture conclusion

The smallest Slice C is a dedicated production loader that reads and replays the
schema-9 journal, selects the exact active May authority/binding tuple, observes
the live Git worktree and host capabilities itself, and returns a validated
`PermissionInvocationContext`. It must not change `PermissionInvocationContext`,
`RuntimeBinding`, schema-9 replay, or mission-runtime composition.

The loader may accept injected host operations for deterministic testing, but it
must accept no caller-created authority, binding, repository observation, or
permission context. Runtime and executor identities come from replayed binding
state. Live root, branch, and HEAD come from host observation performed during
the load. Until #170 owns a closed operation mapping, required capabilities are
conservatively derived as the complete replayed binding capability scope and
checked through a trusted host probe.

Fresh contexts legitimately contain different attestation IDs and timestamps.
The current permission claim path compares whole contexts and reconstructs the
claim record from execute-time attestations, so Slice C must also separate
stable authority/decision identity from volatile host observations while
preserving verification of the immutable original claim receipt. A single load
must double-read both journal and Git state around host probes; this proves
freshness at return, while #170 remains responsible for a later pre-effect
linearization rule.

## Explicit exclusions

- No issue #170 dispatch composition or mission-runtime dependency rewiring.
- No model probe, LM Studio request, May invocation, tool effect, GitHub
  publication, merge, deployment, release, or #137 external run.
- No second authority or binding store, no schema migration, and no conversion
  of legacy schema, caller prose, audit receipts, or control events into
  authority.
