# Feature Flight recovery

Feature Flight recovery is deterministic restart handling after an execute-once
claim, not effect retry. A durable claim permanently prohibits automatic
adapter reinvocation, takeover, lease expiry, or remote reconciliation.

Store classification occurs before fresh repository or remote observation and
before Runner effect callbacks. An exact v2 `terminal.json` winner contains all
bytes needed to create only an absent declared receipt. A success winner owns
`successor.json` and `result.json`; a recovery winner owns `recovery.json` and
prohibits both success receipts. Wrong, partial, mixed, malformed, unsafe, or
unknown artifacts remain untouched and produce ephemeral recovery.

Durable `recovery.json` records a closed reason and phase, exact claim identity,
baseline and nullable latest remote observations, conservative invocation
classification, `effectState:"uncertain_do_not_reinvoke"`, and the sole next
action `inspect_claim_and_remote_non_destructively`. It grants no authority and
is never gate eligible.

Exact v1 success triads replay as `legacy_replayed`. Incomplete v1 and unknown
versions remain immutable and return `legacy_incomplete` or
`unsupported_or_malformed_store`; no v2 artifact is added to their directory.
