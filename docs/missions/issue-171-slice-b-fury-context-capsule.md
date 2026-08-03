# Fury context capsule — issue #171 Slice B

- MISSION: `mission:issue-171-slice-b` at `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`; planning/recon only, non-authoritative telemetry, no implementation, Slice C, #170, export, model, or publication authority.
- EXACT_REVISION: HEAD `b49662b7e004e93253d0d498a5fd7763321aefdf`; blueprint SHA-256 `cc24bd7064b31d0003b364e27988cd2fe339bf29213f0fd0dd921ac59af3bb60`.
- VERDICT: `FURY_REQUIRED_CHANGES`.
- UNRESOLVED: Make lifecycle classes disjoint by excluding `may_control_started` and `may_control_completed` from bounded error terminals, validating codes as-is, and requiring tool completions after startup; freeze primitive valid/invalid envelopes, `read()` output, all wrapper error behavior, `lockOwnerId` validation, and repository-root rules; sync the lock parent immediately after creation and again after verified unlink, with creation-sync, unlink, and unlink-sync failures classified `recovery_required` and overriding narrower post-mutation outcomes.
- NEXT_INPUT: A committed corrected `docs/missions/issue-171-slice-b-may-blueprint.md` on a new exact planning HEAD, with that HEAD and corrected blueprint SHA-256 supplied for rereview.
