# Feature Flight convergence and recovery tools

Use this group when a child mission changes ownership, when independent lanes
converge, and when a flight ends.

## Compile exact handoffs

`shield-ops handoff compile` creates compact checkout, review, or resume
packets from the flight plan, exact worktree, acceptance report, command
receipts, and durable state. Checkout and review packets require passing GREEN
evidence at the clean exact HEAD. Resume packets preserve incomplete state
without claiming completion.

## Prove integration readiness

`shield-ops integration check` requires one exact successful packet from every
declared dependency, rejects stale or unexpected packets, rechecks path
ownership, and detects exact changed-path collisions. Its result is readiness
evidence only; it performs no merge.

## Plan recoverable teardown

`shield-ops teardown plan` classifies absent, dirty, wrong-branch,
unintegrated, and integrated-clean worktrees. It never deletes anything. Even
an integrated clean worktree is only eligible for a later human-confirmed
removal operation.

After the flight, evaluate temporary self-tooling with the
[experimental tool promotion process](./experimental-tool-promotion.md).
