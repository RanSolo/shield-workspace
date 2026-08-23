# Issue #370 — GitHub issue-intake credential discovery

## Exact baseline

- Repository: `RanSolo/shield-workspace`
- Base and planning HEAD: `08cb0def7b4e8f160ad7cfcb20fb41a5258f8faa`
- Trigger: the fresh #341 cold-Hill replay reached `mission begin --profile-aware --issue` and failed with `issue_observation_blocked: authentication_failed` while direct `gh auth status` and `gh api graphql` succeeded.
- Additional observed symptom: the stripped environment caused `gh` to create `.local/state/gh/device-id` under the invoking repository.

## Objective

Make the closed GitHub issue-observer process environment sufficient for normal GitHub CLI authentication and state discovery without widening the executed command, leaking credentials, or permitting repository-local GitHub CLI state.

## Frozen design

1. Keep the executable and GraphQL argv closed exactly as they are.
2. Add a pure `projectGitHubIssueObserverEnvironmentV1` seam accepting explicit `sourceEnv`, `platform`, `sourceRoot`, and `missionRoot`. Production supplies `process.env`, `process.platform`, the invoking source root, and the canonical mission root. The projection always sets `PATH`, `LANG=C`, `LC_ALL=C`, and `GH_PROMPT_DISABLED=1`.
3. This adapter remains GitHub.com-only. Admit only `GH_TOKEN` and `GITHUB_TOKEN`, unchanged and simultaneously when present as non-empty strings so GitHub CLI's documented precedence remains intact. Exclude `GH_HOST`, enterprise tokens, and all unrelated ambient variables. GHES requires a separate source-reference and endpoint contract.
4. Resolve config and state discovery independently:
   - Config precedence: `GH_CONFIG_DIR`; otherwise Windows `AppData`, Unix `XDG_CONFIG_HOME`, then `HOME`.
   - State precedence: `XDG_STATE_HOME`; otherwise Windows `LocalAppData`, then `HOME`.
   - `HOME` remains admitted on Unix whenever it is the state fallback, including when `GH_CONFIG_DIR` is present.
5. Every selected config/state root must be absolute and outside both source and mission roots after no-follow canonicalization of its nearest existing ancestor. Relative, missing, symlink-ambiguous, equal, or nested roots block before spawning `gh` with stable redacted reasons `credential_environment_unsafe` or `credential_state_unavailable`. Rejected path values never appear in diagnostics.
6. Never include the projected environment, token values, config contents, credential paths, or path canaries in observations, digests, errors, logs, journals, or returned evidence. The pure seam is used only to construct the child process environment; ordinary observer results remain closed.
7. Keep exact argv, `shell:false`, ignored stdin, timeout, byte limits, and prompting disabled. Authentication failure remains a stable fail-closed `authentication_failed` result.
8. Prove the real authenticated smoke path snapshots the complete invoking source worktree, including ignored and untracked entries, before and after and leaves it byte-for-byte unchanged. Separately allowlist only the expected mission journal/projection changes under the mission root. The smoke must advance to issue observation or the next non-authentication rail edge.

## Acceptance matrix

- Explicit `GH_TOKEN` and `GITHUB_TOKEN` are admitted together with documented precedence unchanged; `GH_HOST` and enterprise tokens are excluded.
- Stored-login discovery works through separately selected config and state roots when explicit tokens are absent.
- Unix and Windows table cases cover config/state precedence, including `GH_CONFIG_DIR` with no `XDG_STATE_HOME`, Windows `AppData` plus `LocalAppData`, and Unix `HOME` state fallback.
- Empty values, missing safe state roots, relative paths, repository-contained paths, symlink ambiguity, and source/mission root equality fail closed before child execution.
- Missing authentication remains fail-closed.
- Unrelated ambient variables are excluded.
- Secret and path canaries occur nowhere in observer results, stderr/stdout, diagnostics, journals, or projections.
- The observer creates no `.local`, GitHub CLI config, device ID, or other state below the repository root.
- Existing timeout, byte limits, strict JSON, identity checks, acceptance-criteria parsing, and replay identity remain unchanged.
- Deterministic tests inject `sourceEnv`, `platform`, source/mission roots, and a no-follow path canonicalizer rather than mutating global process state.
- Focused adapter and CLI tests pass through Nx with cache enabled; `@shield/multiband` is excluded.

## Bounded paths

- `docs/missions/issue-370-github-credential-discovery-plan.md`
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/tests/github-adapter-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`

## Sequence

1. Fury reviews this exact plan.
2. Coulson turns one implementation key.
3. May implements the bounded environment projection and tests.
4. Mack validates the exact implementation revision using focused and affected Nx targets with cache enabled.
5. Fury performs exact-revision conformance review.
6. Publish a draft PR; merge remains a separate human decision.

## Exclusions

- No token creation, login, logout, credential migration, or credential persistence.
- No generic subprocess-environment framework.
- No GitHub publication behavior changes.
- No changes to #341 scope or authority.
- No merge, deployment, release, or final acceptance.
