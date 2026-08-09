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
HEAD. The compiler canonically snapshots the acceptance spec named by the
report and reuses the full `acceptance-check` evaluator to recompute criterion
coverage, command bindings, receipt semantics, manual evidence, evidence
counts, errors, and final disposition. The supplied report must exactly equal
that recomputation; an empty automated criterion or empty GREEN evidence cannot
pass. The report receipt-digest set must exactly equal the supplied closed
evidence manifest and receipt set. Receipt repository and result bindings are
rechecked by phase: RED receipts must be completed failing commands at their
exact receipt revision, while GREEN receipts must be completed successful
commands. Resume packets may preserve valid structure, RED, or GREEN acceptance
without claiming completion; checkout and review remain current-HEAD GREEN
only. The snapshotted spec's repository root and branch must exactly equal the
canonical mission worktree and planned branch, including valid manual-only
specs with no commands or receipts. Every receipt-declared artifact is verified
against the actual bytes in that worktree. Changed paths are read from raw
NUL-delimited `git diff --name-only -z` bytes with fatal UTF-8 decoding,
recomputed from exact `base..HEAD`, persisted in locale-independent UTF-8 byte
order, and required to be canonical and owned by the mission.

The closed v2 packet binds flight, exact plan, mission, canonical repository
and worktree, branch, base ref/revision, HEAD, ordered changed paths, state,
acceptance spec, acceptance report, evidence manifest, receipts, receipt
artifacts, sequence, and predecessor. Unknown fields are rejected at every
machine-readable object level. The Markdown file is presentation-only.

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
also snapshots each packet-bound handoff state, predecessor, acceptance spec,
acceptance report, evidence manifest, receipt, and receipt-declared artifact
source once. Full acceptance semantics are recomputed from those snapshots.
The replayed acceptance spec repository root and branch must again equal the
canonical planned mission worktree and branch, so a self-consistent report and
manifest cannot substitute a spec for another checkout.
Every source must have its exact canonical path, byte count, and digest and is
registered with its packet, role, receipt ID, and artifact path as applicable.
Reusing one canonical source for distinct logical sources is rejected, and the
closed report validator independently requires global source-path uniqueness.
It re-resolves the current base and mission branch refs, canonical worktrees,
branches, HEADs, cleanliness, and ancestry, then recomputes the
locale-independent ordered `base..HEAD` changed paths through the same raw
NUL-delimited, fatal-UTF-8 reader. Missing, stale, aliased,
unexpected, duplicate, substituted, fabricated, out-of-scope, or
exact-path-colliding packets or sources fail closed.

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

Teardown is read-only. Before resolving any integration ref, it proves the
planned repository root is still canonical, its exact base ref still resolves
to the planned revision, and its canonical common Git directory is available.
Every mission worktree must resolve to that same common Git directory; a
foreign repository or replaced path is preserved and no branch-ref or ancestry
eligibility check is attempted for it. It inventories tracked, modified
tracked, untracked, and ignored files using raw NUL-delimited Git byte output,
fatal UTF-8 decoding, and canonical relative-path validation. The optional
integration ref must be exactly `refs/heads/{plan.integration.branch}`; only
then does the tool resolve that full ref with `show-ref --verify` before any
ancestry check.
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
worktree. Observed paths come from NUL-delimited
`git worktree list --porcelain -z` records; malformed, invalid UTF-8,
unresolved, or non-canonical observations fail closed, including paths with
embedded newlines or other control characters. Outputs are create-only and are
not written when confinement or validation fails.
