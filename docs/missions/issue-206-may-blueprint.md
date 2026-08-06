# May blueprint — issue #206

Implement the Fury-approved `docs/missions/issue-206-plan.md` as one bounded
change. Preserve the existing tool vocabulary and outer mission-cycle model.

## Writable paths

- `packages/shield-team-system/src/may-tool-effect-v1.mts`
- `packages/shield-team-system/src/governed-may-dispatch-v1.mts`
- `packages/shield-team-system/scripts/model/may-tool-executor.mjs`
- `packages/shield-team-system/tests/may-tool-executor.test.mjs`
- `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`

## Acceptance checklist

- 1–7 distinct ordered writes followed by one final validation.
- Legacy one-write packets preserve their meaning.
- Every operation retains exact effect-key and precondition binding.
- Sequence mismatch is rejected before the mismatched effect.
- Success proves every per-call audit/control record plus one outer effect and
  one completed receipt.
- Partial progress cannot be reported completed or replayed as fresh work.
- No new tool, authority class, schema, shell execution path, or automatic
  rollback.

Return changed files, commands actually run, exact results, and unresolved
risks. Stop on any contradiction with the governing plan.
