# Feature Flight preflight tools

Use this group before any child mission receives implementation authority. The
tools compile and verify non-authoritative construction evidence; they do not
create branches, worktrees, journals, bindings, or approvals.

## Plan the flight

`shield-ops flight prep` validates the mission dependency graph, lane
assignment, writable-path ownership, intended worktrees, and exact repository
base. With `--output`, it writes a create-only resolved plan, launch packets,
evidence templates, and bootstrap receipt.

## Close shared evaluation inputs

`shield-ops fixture build` creates a synthetic, customer-free PDF comparison
fixture with per-file hashes and negative inputs. This is a specialized
dogfood utility: use it only when the flight contract calls for that fixture;
do not mistake it for a general fixture service.

## Verify construction

`shield-ops construction check` distinguishes absent, clean, dirty,
wrong-branch, and colliding worktree paths. Add `--require-created` only after
the host has independently constructed every declared worktree.

## Run one preflight diagnosis

`shield-ops flight doctor` verifies the resolved package, repository identity,
fixture binding, construction observations, and artifact hashes. A healthy
report means the observed topology is internally consistent; it is not Wheels
Up authority.
