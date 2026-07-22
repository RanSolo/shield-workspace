# Issue #42 — Bounded May Control Loop

## Mission

Complete the next Issue #42 increment by adding the smallest safe LM Studio May
control loop on top of the accepted May executor contract.

## Scope

- Add a bounded local May control loop that talks only to loopback LM Studio.
- Reuse the existing `writeFile` and `runValidation` tools.
- Preserve revision-bound file writes, allowlisted validation commands, fresh
  permission checks, result audit escrow, and workspace uncertainty stops.
- Require the probed loaded runtime identity to match the bound May reasoning
  runtime.
- Record non-authoritative control-loop events for start, tool completion,
  terminal completion, and fail-closed stops.
- Return final May prose as untrusted model output.

## Boundaries

- No GitHub publication, merge, deployment, release, broad network, shell, or
  caller-selected command authority is added.
- Validation failures remain evidence that May can use for bounded correction.
- Uncertain executor outcomes, malformed tool protocol, stale workspace state,
  duplicate tool calls, missing validation, runtime mismatch, or event receipt
  failure stop the loop fail closed.
- Hill-controlled iteration from #67 governs broader mission routing; the loop
  does not route seats or grant authority.

## Validation

- Focused May executor tests cover a repair loop:
  inspect prompt context -> authorized edit -> failing validation ->
  bounded correction -> passing validation -> final report.
- Focused adversarial tests cover runtime mismatch, final report before
  validation, control-event receipt failure, duplicate tool calls, and uncertain
  executor outcomes.
- Public package surface tests verify the exported runtime and declaration
  contract.
- Full `@shield/team-system` validation passes.

## Remaining non-goals

- Mack validation ownership.
- Follow-up Mode.
- SonarQube ingestion.
- Production adoption of Stage B replay.
- Autonomous merge, deployment, release, or external communication.
