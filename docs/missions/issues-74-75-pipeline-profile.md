# Mission Brief — Issues #74/#75 Pipeline Modes and Repository Profiles

## Objective

Define composable validation pipeline modes and the evidence-bound repository
pipeline profile used to select them. Mission modes govern how the team works;
pipeline modes govern which validation lanes run.

## Scope

- Add a closed `pipeline.profile.v1` taxonomy for initial validation lanes.
- Represent supported, default, conditional, and unavailable repository pipeline
  modes.
- Require supported modes to bind to concrete repository evidence and either a
  real command or an adapter-backed lane such as SonarQube.
- Let Hill derive required validation lanes from repository profile, changed
  files, risk triggers, explicit requested modes, and bounded additional mode
  requests.
- Treat pipeline-relevant file changes as stale-profile evidence that fails
  closed before validation reuse.
- Encode interim ownership and future Mack ownership boundaries as explicit
  non-authoritative policy metadata.

## Boundaries

- The selector is pure and non-authoritative.
- It does not inspect the live repository, execute commands, run Mack, post
  GitHub replies, mutate mission state, or grant merge/release/deploy authority.
- Missing or unsupported modes are reported as unavailable; the selector never
  fabricates generic commands.
- Mack may eventually execute and interpret validation evidence, but Mack does
  not become the implementer or override Hill, Fury, Fitz, or Coulson.
- Starter pipeline setup for new repositories remains separate issue #76.

## Acceptance evidence

- Closed pipeline-mode taxonomy is exported.
- Default and conditional modes are selected deterministically from profile and
  mission risk evidence.
- Unsupported requested modes are surfaced as unavailable instead of guessed.
- Repository/revision mismatches fail closed.
- Pipeline-relevant file changes mark the profile stale.
- Additional validation mode requests fail closed when outside mission scope.
- Runtime imports, declarations, packed package contents, and strict external
  TypeScript consumer validation cover the new public specifier.

