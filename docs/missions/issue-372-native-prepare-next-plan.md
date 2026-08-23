# Issue #372 — native issue-intake `prepare-next`

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base and plan HEAD before this artifact: `604e4d22c1f989aab9b13f3696eb882bb5bcd850`
- Issue: `#372`
- Authority: none; planning and technical review only

## Problem

`mission begin --profile-aware --issue` now creates a valid profile-aware issue-intake journal at sequence 0 and returns `mission prepare-next`. The consumer immediately attempts to read a protected reviewed-transition graph. Because that graph correctly does not exist yet, the generic protected-evidence fallback treats the native journal as legacy, requests a Fury model, and ultimately rejects the journal as `unsupported_legacy_lineage`.

## Bounded design

1. Add a closed, read-only native issue-intake routing classifier at the start of `mission prepare-next`, before protected reviewed-transition graph preparation.
2. The classifier may return `mission_authorization_ready` only when all of these facts are true in one validated profile-aware replay:
   - exactly one journal entry exists at sequence 0;
   - the entry is `mission.begun` and carries the closed issue-intake source binding;
   - authorization is `waiting`, execution is `not-started`, implementation authority is `waiting`, and final acceptance is `waiting`;
   - exactly one unsatisfied Coulson `mission_authorization` requirement exists;
   - no authority, runtime binding, publication authority, execution, or later evidence exists.
3. Return a deterministic authority-none preparation result that identifies Coulson as owner, `mission.authorize` as the executable command, and `humanGate: true` / `pinRequired: true`. The preparation command performs no journal mutation and does not read or require a Fury model.
4. Exact replay returns the same result. Any malformed journal remains rejected by normal journal replay. Any conflicting or advanced issue-intake lineage bypasses this fresh route and continues through the existing native reviewed-transition resolver; it must never be coerced into the fresh authorization route.
5. Preserve the existing protected-graph and five-entry legacy continuation path byte-for-byte for genuinely legacy eligible missions.

## Smallest path set

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `docs/missions/issue-372-native-prepare-next-plan.md`

No package export, schema package, mission journal format, signer, authorization executor, or legacy compositor change is required.

## Validation

- Focused CLI tests prove fresh issue-intake sequence 0 returns the closed authorization route without calling protected graph preparation or legacy continuation.
- Exact replay is byte-identical.
- Missing `--fury-model` is irrelevant on this native route.
- Advanced, conflicting, non-issue-intake, malformed, and protected-evidence cases do not enter the fresh route.
- Existing legacy continuation tests remain unchanged and pass.
- Run `@shield/team-system:build` and focused tests through Nx with cache enabled, on the repository-supported Node version.
- Run `git diff --check`.

## Seat sequence and gates

Fury reviews this exact plan. After Fury PASS, Coulson authorizes bounded implementation. May implements, Mack validates the exact revision, and Fury performs exact-revision conformance review. Publication, merge, release, deployment, and final acceptance remain separate human decisions.
