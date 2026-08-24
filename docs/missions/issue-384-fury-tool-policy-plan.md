# Issue #384 — production Fury callback observation plan

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base: `a93ab6c406bc4315eb5f1f5bd32f13c970aadbca`
- Parent proving loop: #341
- Blocked mission: #383
- Failed production receipt: `receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c`
- Failure: `COPILOT_EXECUTION_FAILED / Copilot session identity or policy drifted.`
- Observed flags: model change false, agent substitution false, unauthorized tool/effect true
- Pinned runtime: `@github/copilot-sdk@1.0.11`

## Objective

Add a bounded, redacted production diagnostic that reveals the actual pinned-SDK
callback sequence responsible for Fury's opaque policy failure. Preserve the
current fail-closed permission policy unchanged. This slice does not admit any
new tool call or effect.

## Frozen implementation

1. Add a closed internal observation contract for the existing production Fury
   executor. Each record contains only:

   - callback surface: `pre_tool | permission | handler`;
   - ordinal;
   - SDK callback identity fields when actually supplied, represented as
     `present | absent` rather than retaining their values;
   - tool identity: `read | search | unknown`;
   - permission kind from a closed enum, or `unknown`;
   - argument shape: sorted field names and closed primitive/container kinds,
     with no argument values;
   - expected-session match when the callback supplies a session identity;
   - decision: `allow | deny | reject | invoked | not_invoked`;
   - closed reason code.

2. Retain at most 32 ordered records in memory. Preserve the first denial or
   rejection as the final retained record if truncation occurs. Saturate the
   total count at `Number.MAX_SAFE_INTEGER`. Raw paths, queries, file contents,
   prompts, credentials, session IDs, tool-call IDs, and unrestricted argument
   values must never enter the observation object.

3. Attach the validated observation only to the existing terminal production
   executor result. It is diagnostic evidence, grants no authority, and cannot
   make a failed result usable. Existing
   `unauthorizedToolOrEffectObserved` behavior remains sticky and unchanged.

4. Do not change `availableTools`, `excludedTools`, `onPreToolUse`,
   `onPermissionRequest`, handlers, approval responses, or tool argument
   validation. In particular, permission callbacks continue to reject every
   request in this slice.

5. Add a production-faithful harness around the existing executor boundary that
   supplies the exact callback payloads exposed by the pinned SDK adapter and
   proves the observed order. The harness must not invent optional IDs or
   session fields absent from the real callback surface.

6. Add fixed legacy-result fixtures proving prior result schemas still replay
   byte-for-byte without executing tools and without requiring the diagnostic.

7. Run one fresh #383 successor after this slice is implemented. Its failed
   terminal packet must expose enough redacted callback evidence for Fury to
   freeze a separate admission correction. If no relevant callback occurs, or
   the diagnostic cannot distinguish the failing surface, stop and report that
   exact result rather than widening policy.

## Expected paths

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- this plan

Expand only if the existing closed result type requires one small internal
contract module; do not change package exports for a diagnostic-only seam.

## Validation

- Focused dispatcher tests through the Team System Nx test target.
- Production-faithful callback observation tests, including absent optional
  identifiers, unknown callback shapes, truncation, first-denial retention, and
  redaction assertions.
- Legacy replay fixture tests proving no executor/tool effect.
- `npm exec nx affected -t build,test --base=a93ab6c406bc4315eb5f1f5bd32f13c970aadbca --head=<candidate> --exclude=@shield/multiband`
- Warm-cache rerun.
- `git diff --check a93ab6c406bc4315eb5f1f5bd32f13c970aadbca..<candidate>`
- Fresh #383 successor production attempt.

## Terminal boundary

This slice ends with the redacted production callback transcript. Fury reviews
that exact evidence before any policy-admission plan is written.

## Exclusions

No tool-policy widening; no callback-name normalization; no generic approval;
no repository writes by Fury; no shell/process, network, MCP, Git, publication,
merge, deployment, release, final acceptance, or new human authority.
