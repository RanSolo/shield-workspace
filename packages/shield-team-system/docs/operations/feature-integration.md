# Governed feature integration

`@shield/team-system/feature-integration` advances one authorized child at a
time through a feature branch. It never merges the feature PR to `main`, marks
that PR ready, deploys, releases, or authorizes a child mission.

## Trust boundary

Start from a verified `feature.operation.v1` plan and Coulson-signed authority.
Initialize the append-only feature-integration journal with the trusted genesis
head and tree. Only replay of canonical accepted entries produces the replay
context consumed by later stages. Callers cannot supply accepted host state,
timestamps, heads, trees, receipts, attempt counts, or evidence projections.

Every owned host mutation follows `effect_prepared -> invoke once -> independent
observation -> accepted | effect_not_applied | effect_uncertain`. A prepared or
uncertain effect is never retried. Reconcile it from a new challenge-bound host
observation; use a distinct plan-authorized key only after trusted proof that the
prior effect was not applied.

## One-stage controller

Invoke `runFeatureIntegrationControllerV1` with the journal store scope and a
fresh challenge-bound repository observation. Without `executeStage: true`, it
returns the single replay-derived `ready` stage and performs no effect. With
explicit execution it calls only the matching bounded stage owner once.

`implementation_handoff_ready` and `rollback_mission_handoff_ready` are
observation-only. The independently governed schema-9 mission completes its own
work before the corresponding acceptance bridge may append an exact receipt.

After each accepted integration or rollback, cumulative validation is pending.
Its separate signed authority binds the terminal head/tree, transition receipt,
ordered commands, targets, validation IDs, Mack evidence request, and one effect
key. Command exceptions or malformed runner results are uncertainty, not test
failure. A passing current receipt is required before the next child or final
completion.

## Recovery

The store uses a one-writer lock, canonical bytes, compare-by-sequence/digest,
same-directory atomic replacement, and file/directory durability checks. A
post-replacement proof failure returns `recovery_required`. Read the journal and
classify it as the unchanged baseline, complete candidate, or unverifiable; do
not retry blindly.

Always stop on repository, branch, PR target, draft state, policy, head, tree,
review, check, authority, identity, or journal drift. A failed cumulative result
permits only a freshly authorized rerun, latest-integration rollback handoff, or
closed lifecycle disposition.
