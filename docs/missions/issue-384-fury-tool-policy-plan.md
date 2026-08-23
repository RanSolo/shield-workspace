# Issue #384 — production Fury tool-policy correction plan

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base: `a93ab6c406bc4315eb5f1f5bd32f13c970aadbca`
- Parent proving loop: #341
- Blocked mission: #383
- Failed production receipt: `receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c`
- Failure: `COPILOT_EXECUTION_FAILED / Copilot session identity or policy drifted.`
- Observed flags: model change false, agent substitution false, unauthorized tool/effect true

## Objective

Correct the production Copilot Fury executor so the exact registered,
host-backed immutable `read` and `search` tools remain usable across the
SDK's real pre-tool and permission callback sequence, while every other tool or
effect remains fail-closed. Preserve bounded policy diagnostics in terminal
failure evidence so a denied legal call can be distinguished from a genuinely
forbidden attempt.

## Smallest implementation

1. Add one internal closed classifier for tool-policy observations. It accepts
   the callback surface, SDK tool name/namespace, and arguments; it returns
   `allow` only for the registered custom `read` or `search` operation
   whose arguments validate against the immutable exact-Git-tree artifact map.
2. Use that classifier from both `onPreToolUse` and
   `onPermissionRequest`. A valid custom-tool permission callback is approved
   for that invocation and does not set
   `unauthorizedToolOrEffectObserved`. All other permission kinds, names,
   namespaces, and arguments are denied.
3. Normalize only the SDK's documented representation of the two registered
   custom tools. Never normalize a built-in, MCP, shell, write, URL, memory,
   extension, Git, or unknown operation into the allowlist.
4. Preserve closed policy decisions in both completed and failed execution
   observations: callback surface, normalized tool identity, decision, and
   reason code. Do not retain raw file bytes, prompts, credentials, or
   unrestricted argument values.
5. Keep a denied attempt terminal: output from a session with any forbidden or
   malformed call remains unusable.
6. Add focused production-faithful tests for valid read/search through both
   callback surfaces, SDK namespace representation, malformed/out-of-map
   arguments, forbidden permission kinds, MCP, and denied-attempt terminal
   behavior.
7. Revalidate the existing immutable artifact-map, model/agent identity,
   exact-revision, persistence, execute-once, recovery, and replay tests.

## Expected paths

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- this plan

Expand only if exact SDK types prove a separate small contract module is
required.

## Validation

- Focused node-test files through the Team System Nx target.
- `npm exec nx affected -t build,test --base=a93ab6c406bc4315eb5f1f5bd32f13c970aadbca --head=<candidate> --exclude=@shield/multiband`
- Warm-cache rerun.
- `git diff --check a93ab6c406bc4315eb5f1f5bd32f13c970aadbca..<candidate>`
- Fresh #383 production Fury successor proving PASS or REVISE without opaque
  policy drift.

## Exclusions

No broader repository tools, shell/process execution, filesystem writes, Git
mutation, network/MCP access, new authority, Fury rubric change, #383
implementation, publication, merge, deployment, release, or final acceptance.
