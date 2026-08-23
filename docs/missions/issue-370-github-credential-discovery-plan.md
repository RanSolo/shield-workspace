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
2. Replace the three-variable environment builder with a versioned, testable projection that always sets `PATH`, `LANG=C`, `LC_ALL=C`, and `GH_PROMPT_DISABLED=1`.
3. Copy only the GitHub CLI authentication/discovery variables documented by the installed `gh help environment` surface when they are present as non-empty strings:
   - `GH_TOKEN`, then `GITHUB_TOKEN`;
   - `GH_ENTERPRISE_TOKEN`, then `GITHUB_ENTERPRISE_TOKEN`;
   - `GH_HOST`;
   - `GH_CONFIG_DIR`;
   - `XDG_CONFIG_HOME`, `AppData`, and `HOME` only as path-discovery inputs needed when `GH_CONFIG_DIR` is absent;
   - `XDG_STATE_HOME` when present so GitHub CLI state remains host-scoped.
4. Preserve GitHub CLI precedence by copying names and values without translating one token variable into another.
5. Never include the projected environment, token values, config contents, or credential paths in observations, digests, errors, logs, journals, or returned evidence.
6. Keep stdin disabled and prompting disabled. Authentication failure remains a stable fail-closed `authentication_failed` result.
7. Prove the real authenticated smoke path leaves the repository byte-for-byte clean and advances to issue observation or the next non-authentication rail edge.

## Acceptance matrix

- Explicit `GH_TOKEN` and `GITHUB_TOKEN` are admitted with documented precedence unchanged.
- Stored-login discovery works through the minimal host path variables when explicit tokens are absent.
- Missing authentication remains fail-closed.
- Unrelated ambient variables are excluded.
- No secret value, credential path, or child environment is returned or persisted.
- The observer creates no `.local`, GitHub CLI config, device ID, or other state below the repository root.
- Existing timeout, byte limits, strict JSON, identity checks, acceptance-criteria parsing, and replay identity remain unchanged.
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
