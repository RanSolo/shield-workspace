# Feature Flight convergence and recovery tools

Use these observational tools when a child mission changes ownership, when
independent lanes converge, and when a flight ends. Every artifact is
non-authoritative. None of these commands grants human approval, merge
authority, publication authority, or permission to remove a worktree.

## Record closed handoff state

```bash
npx shield-ops handoff state \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --mission mission:a \
  --worktree /canonical/mission/worktree \
  --status /absolute/path/to/closed-status.json \
  --sequence 0 \
  --output /absolute/path/to/new-handoff-state.json
```

The status input has exactly `currentGate`, `decisions`,
`processExperiments`, `toolsCreated`, `risks`, `blockers`, and
`recommendedNextAction`. The create-only producer emits closed handoff-state
version 2 bound to the exact flight and plan bytes, mission, canonical
repository and worktree, branch, base, HEAD, sequence, and predecessor.
Genesis sequence `0` requires a null predecessor. Later sequences require the
exact sequence-minus-one predecessor snapshot and its externally expected
SHA-256:

```bash
npx shield-ops handoff state \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --mission mission:a \
  --worktree /canonical/mission/worktree \
  --status /absolute/path/to/closed-status.json \
  --sequence 1 \
  --predecessor-state /absolute/path/to/handoff-state-0.json \
  --expected-predecessor-sha256 PREDECESSOR_SHA256 \
  --output /absolute/path/to/new-handoff-state-1.json
```

## Compile exact handoffs

```bash
npx shield-ops handoff compile \
  --flight-plan /absolute/path/to/flight-plan.resolved.json \
  --mission-id mission:a \
  --worktree /canonical/mission/worktree \
  --acceptance-report /absolute/path/to/acceptance.json \
  --evidence-manifest /absolute/path/to/evidence-manifest.json \
  --state /absolute/path/to/handoff-state.json \
  --expected-state-sha256 STATE_SHA256 \
  --expected-state-sequence 0 \
  --receipt /absolute/path/to/receipt.json \
  --output-dir /absolute/path/to/new-packet-directory \
  --mode checkout
```

After genesis, compilation also requires `--predecessor-state` and
`--expected-predecessor-sha256`. Each file input is snapshotted once. The
compiler rejects non-canonical or symlink worktree aliases, current ref/branch
or HEAD drift, base-ref drift, broken ancestry, dirty worktrees, stale state,
and broken predecessor identity.

Checkout and review packets require closed passing GREEN acceptance at current
HEAD. The acceptance report receipt-digest set must exactly equal the supplied
closed evidence manifest and receipt set. Receipt repository and result
bindings are rechecked. Changed paths are recomputed in Git's deterministic
order from exact `base..HEAD`, and every path must be owned by the mission.

The closed v2 packet binds flight, exact plan, mission, canonical repository
and worktree, branch, base ref/revision, HEAD, ordered changed paths, state,
acceptance report, evidence manifest, receipts, receipt artifacts, sequence,
and predecessor. Unknown fields are rejected at every machine-readable object
level. The Markdown file is presentation-only.

## Prove integration readiness

```bash
npx shield-ops integration check \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --target-mission mission:integration \
  --packet /absolute/path/to/dependency-a/handoff.json \
  --packet /absolute/path/to/dependency-b/handoff.json \
  --output /absolute/path/to/new-integration-report.json
```

The checker snapshots the plan and each supplied packet once, then requires the
packet identity set to equal the target mission's declared dependencies. It
re-resolves the current base and mission branch refs, canonical worktrees,
branches, HEADs, cleanliness, and ancestry. For each dependency it validates
the closed packet, exact flight/plan/mission/repository identity, acceptance
and receipt bindings, and a fresh ordered `base..HEAD` changed-path
recomputation. Missing, stale, unexpected, duplicate, substituted, fabricated,
out-of-scope, or exact-path-colliding packets fail closed.

The closed v2 integration report is compatibility evidence only. It performs
no checkout, merge, approval, publication, deployment, or release.

## Plan recoverable teardown

```bash
npx shield-ops teardown plan \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --integration-ref refs/heads/feature/test \
  --archive-evidence /absolute/path/to/recovery-archive.json \
  --output /absolute/path/to/new-teardown-report.json
```

Teardown is read-only. It inventories tracked, modified tracked, untracked,
and ignored files for every existing canonical mission worktree. Exact branch
ref evidence must recover the observed HEAD. Every unrecorded regular file or
symlink must either remain preserved or be matched by one unambiguous closed
archive manifest bound to the flight, mission, canonical repository/worktree,
branch, HEAD, and exact file category/path/type/byte-count/SHA-256 set.

Missing refs, dirty worktrees, ignored or untracked artifacts without archive
evidence, mismatched archives, path aliases, wrong branches, and clean but
unintegrated revisions remain preservation dispositions. Even
`eligible-for-human-confirmed-removal` is only a report value: the tool never
deletes a file, worktree, branch, archive, or evidence artifact.
