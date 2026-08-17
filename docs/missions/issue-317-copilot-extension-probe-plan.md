# Issue #317 — Copilot extension probe correction plan

## Identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `b22152e51907eb5669dc43a6bdb3df23f589700e`
- Branch: `agent/issue-317-copilot-probe`
- Parent proving issue: `#307`
- Authority during planning: none

## Objective

Correct the GitHub Copilot teammate preflight so an unreliable extension-version
probe remains truthful advisory evidence but cannot independently block the
operator-confirmation gate. Preserve exact repository, agent-card, VS Code host,
and final repository-stability failures.

## Verified defect

The current Copilot preflight resolves the first executable named `code`, runs
`--list-extensions --show-versions`, and requires exactly one semver-bearing
`github.copilot-chat` entry. It then turns every other result into a failed
`host.copilot_extension` machine check. The teammate launcher independently
requires that same check to pass and requires an `available` extension with a
semver before it will validate the preflight or write its receipt.

That assumption is not portable:

1. WSL PATH may resolve a Windows-side VS Code CLI rather than the Remote-WSL
   host backing the active Agents window.
2. Copilot Chat may be bundled with VS Code and omitted from the user-installed
   extension list.
3. The Remote-WSL CLI may require live IPC state unavailable to a detached
   preflight process.

All five tracked Copilot agent cards and VS Code `1.133.0` were observed
successfully at the #307 proving revision before this false blocker stopped the
trial.

## Contract decision

Keep `shield.copilot-teammate-readiness.v1`. No JSON field is added, removed, or
renamed. The existing unions already support an `observed` machine-check status,
nullable extension version, and the closed extension classifications
`available`, `unavailable`, `malformed`, and `timeout`.

Change only the meaning of `host.copilot_extension`:

- it is always an advisory `observed` row;
- its classification maps to exactly one closed row:

  | extension classification | status | reason code |
  | --- | --- | --- |
  | `available` | `observed` | `none` |
  | `unavailable` | `observed` | `copilot_extension_not_observed` |
  | `malformed` | `observed` | `copilot_extension_observation_malformed` |
  | `timeout` | `observed` | `copilot_extension_observation_timeout` |

- `available` uses the existing no-action text;
- every non-available classification uses exact bounded next-action text that
  requires visible VS Code confirmation without claiming extension availability,
  entitlement, picker state, or seat readiness;
- none of those extension classifications participates in readiness
  disposition;
- `host.vscode` remains a required passing machine check;
- picker rendering, entitlement, seat identity, selected model, tools,
  instructions, and creation remain explicitly `unverified` until the operator
  confirms them visibly.

The teammate-launch validator and receipt adapter must accept every closed
extension observation that is structurally consistent:

- `available` requires a valid semver version;
- every other classification requires `version: null`;
- identifier remains exactly `github.copilot-chat`;
- the receipt preserves the observed classification and nullable version rather
  than converting uncertainty into success.

## Exact implementation paths

1. `packages/shield-team-system/src/copilot-teammate-readiness-v1.mts`
2. `packages/shield-team-system/tests/copilot-teammate-readiness-v1.test.mjs`
3. `tools/teammate-launch.mjs`
4. `tools/teammate-launch.test.mjs`
5. `docs/operations/vscode-agents-teammate-trial.md`

The plan itself is the only additional changed path during planning.

## Implementation steps

1. Add a closed helper for the advisory extension machine-check row and remove
   extension availability from failed-check selection without changing check
   ordering.
2. Distinguish zero matching extension entries (`unavailable`) from malformed or
   duplicate matching entries (`malformed`) while preserving timeout and failed
   execution classifications.
3. Update the launcher’s exact Copilot report validator to require the advisory
   row and validate extension classification/version consistency instead of
   requiring `available`.
4. Update the receipt adapter to preserve any structurally valid closed
   observation, including `version: null`.
5. Add focused regression coverage for:
   - installed extension with valid semver;
   - bundled/unlisted extension;
   - a wrong-PATH executable returning no Copilot entry;
   - malformed or duplicate Copilot entries;
   - extension probe timeout/failure;
   - absent or malformed VS Code host still blocking;
   - missing or malformed SHIELD agent cards still blocking;
   - launcher validation and receipt preservation for non-available extension
     observations;
   - launcher rejection of classification, reason-code, next-action, or
     version-consistency mismatches.
6. Correct the teammate-trial guide so extension identity is advisory and
   visible operator confirmation remains the actual Copilot gate.

## Validation

Run through Nx from the exact implementation revision:

```text
npm exec nx run @shield/team-system:build
npm exec nx run @shield/team-system:test
```

Also run the launcher’s repository-level test directly because it is outside
the package test glob:

```text
node --test tools/teammate-launch.test.mjs
git diff --check
```

Finally rerun the authority-neutral #307 Copilot preflight in the WSL proving
environment. It must reach `ready_for_host_confirmation` when repository,
revision, agent cards, VS Code host, and stability checks pass, regardless of
whether the extension version is observable.

## Stop conditions

Stop and return to Fury or Hill if the correction requires:

- changing agent-card declarations or model routing;
- treating operator confirmation as machine evidence;
- weakening repository, revision, cleanliness, agent-card, VS Code, or stability
  checks;
- changing authority, mission, publication, merge, deployment, or release
  behavior;
- introducing a new host adapter or readiness contract version.

## Exclusions

- No teammate exercise or model invocation for #307.
- No mission authority, PIN, publication, merge, deployment, or release.
- No broad seat-contract hardening from #316.
- No global VS Code or Copilot installation changes.
- No claim that extension absence proves Copilot availability.
