# Mission Brief: Issue #42 minimum governed May executor

- **Mission:** `mission:issue-42`
- **Subject:** `issue:42`
- **State:** Wheels Up
- **Human authority:** Phil Coulson
- **Accountable implementation seat:** Melinda May
- **Reasoning runtime during bootstrap:** `runtime:codex-frontier`
- **Tool executor during bootstrap:** `executor:codex-host`
- **Target runtime:** local May through LM Studio
- **Merge, deployment, and release authority:** none

## Objective

Provide the smallest implementation-capable local May contract: revision-bound
workspace edits and exact allowlisted validation commands, each protected by a
fresh Issue #10 permission decision and append-only action evidence.

This mission establishes a governed executor. It does not authorize Stage B,
merge, deployment, release, GitHub mutation, arbitrary shell execution, or
runtime substitution.

## Frozen Phase 1 surface

The May session may receive the existing bounded repository-read tools plus
exactly two implementation tools:

- `writeFile` writes one host-approved repository-relative UTF-8 file after
  verifying the bound Git revision and the expected current file digest.
- `runValidation` invokes one host-configured validation command ID using an
  exact executable and argument vector, without a shell.

The model cannot provide executable paths, arguments, environment variables,
working directories, repository roots, approved files, revisions, permission
contexts, or command definitions.

## Authority and identity

- May is the accountable seat.
- The reasoning runtime is the uniquely loaded LM Studio instance selected by
  the trusted host.
- The write-and-test executor has a separate executor identity.
- Every tool call consumes a unique host-issued runner slot.
- The requested effect key binds the exact path, expected digest, and content
  digest for writes, or the exact command ID, executable identity, arguments,
  and timeout for validation.
- Every tool call receives a fresh permission decision immediately before
  invocation.
- The decision and invocation contexts must match the mission, subject, seat,
  runtime, executor, repository, canonical root, branch, artifact revision,
  journal sequence, action, effect class, effect key, and capability.
- Operational capability and writability attestations do not grant authority.

## Safety contract

- Repository paths are closed, relative, bounded, non-sensitive, and selected
  from a host-owned allowlist.
- Parent symlinks, target symlinks, root identity changes, revision changes,
  stale content digests, and malformed UTF-8 input fail before writes.
- Trusted workspace status must contain only host-approved paths before a call
  and after an effect; any other dirty path fails closed or records the
  already-attempted effect as uncertain.
- Writes are bounded and replaced atomically within the verified parent.
- Validation uses no shell, configuration discovery, caller-provided command,
  inherited environment, or network-specific command surface.
- Validation is observational: any workspace-status change during the command
  records an uncertain result and terminates the session.
- Executable identity is pinned at setup and rechecked before every launch.
- Output, duration, rounds, and calls are bounded.
- A failed validation result may be returned to May for one iterative repair;
  permission, identity, audit, protocol, or confinement failure terminates the
  session.
- Responses from the model remain untrusted attribution.

## Action mappings

| Tool | Action | Effect class | Capability |
| --- | --- | --- | --- |
| `readFile` | `repository.read_file` | `verification` | `filesystem_read` |
| `listFiles` | `repository.list_files` | `verification` | `filesystem_list` |
| `searchRepo` | `repository.search` | `verification` | `filesystem_search` |
| `writeFile` | `repository.write_file` | `behavioral_implementation` | `filesystem_write` |
| `runValidation` | `repository.run_validation` | `verification` | `process_execute` |

## Validation obligations

- Focused May executor tests cover successful revision-bound edits and failed
  validation feedback.
- Adversarial tests cover wrong seat, runtime, executor, root, revision,
  permission, digest, path, symlink, command ID, executable identity, audit
  receipt, timeout, and multi-call effect attempts.
- Existing Daisy broker behavior remains unchanged.
- Package surface declarations and packed-consumer imports remain consistent.
- Full team-system and workspace tests pass.

## Stop conditions

Stop and return to Coulson for any need to add arbitrary commands, shell
execution, network access, unapproved paths, automatic runtime substitution,
authority creation, recursive or unbounded repair, GitHub publication from the
executor, merge, deployment, release, production effects, Kernel semantics, or
changes to the certified Stage A artifacts or frozen Stage B envelope.

## Acceptance criteria

- May can inspect approved repository context, edit an approved file, run an
  approved validation, observe a failure, correct the file, and report results.
- Workspace HEAD and canonical root are checked before every write or command.
- Existing files require an exact expected SHA-256; new files require an
  explicit absent precondition.
- Every invocation is permissioned and audited through the existing #10
  contracts.
- Action evidence contains identities and bounded summaries, never private
  reasoning, secrets, or raw file contents.
- Missing, stale, malformed, ambiguous, mismatched, reused, or unrecorded
  authority fails closed.
- No tool grants merge, deployment, release, arbitrary shell, or external
  communication authority.
