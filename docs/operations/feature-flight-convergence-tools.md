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
bindings are rechecked, and every receipt-declared artifact is verified against
the actual bytes in the canonical mission worktree. Changed paths are
recomputed from exact `base..HEAD`, persisted in locale-independent UTF-8 byte
order, and every path must be owned by the mission.

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
also snapshots each packet-bound handoff state, predecessor, acceptance report,
evidence manifest, receipt, and receipt-declared artifact source once. Every
source must have its exact canonical path, byte count, and digest; closed source
validators and cross-bindings are replayed. It re-resolves the current base and
mission branch refs, canonical worktrees, branches, HEADs, cleanliness, and
ancestry, then recomputes the locale-independent ordered `base..HEAD` changed
paths. Missing, stale, aliased, unexpected, duplicate, substituted, fabricated,
out-of-scope, or exact-path-colliding packets or sources fail closed.

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
and ignored files for every existing canonical mission worktree. The optional
integration ref must be exactly `refs/heads/{plan.integration.branch}`; the
tool resolves that full ref with `show-ref --verify` before any ancestry check.
Exact mission branch-ref evidence must recover the observed HEAD. Every
unrecorded regular file or symlink must either remain preserved or be matched
by one unambiguous closed archive manifest and its actual external payload. The
manifest binds the payload's canonical path, bytes, SHA-256, and
`json-base64-v1` format. The payload must be outside every removable worktree,
must contain recoverable bytes for every file, and must exactly equal the
flight, mission, canonical repository/worktree, branch, HEAD, and complete file
category/path/type/byte-count/SHA-256 inventory.

Missing refs, dirty worktrees, ignored or untracked artifacts without archive
evidence, mismatched archives, path aliases, wrong branches, and clean but
unintegrated revisions remain preservation dispositions. Even
`eligible-for-human-confirmed-removal` is only a report value: the tool never
deletes a file, worktree, branch, archive, or evidence artifact.

All handoff-state, handoff-packet, integration-report, and teardown-report
output paths must be outside every planned or currently observed flight
worktree. Outputs are create-only and are not written when confinement or
validation fails.
