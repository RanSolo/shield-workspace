# May blueprint — issue #194

Implement only the Fury-approved issue #194 plan.

This packet is executed by hosted May because the local governed May write
path is the defect being corrected. Preserve the May seat and exact signed
scope; do not treat the bootstrap executor choice as broader authority.

## Production change

In `packages/shield-team-system/src/governed-may-dispatch-v1.mts`, remove the
temporary counter and make `nextTemporaryName` accept `{ sessionId,
toolCallId }`. Return `.shield-may-${digest}.tmp`, where `digest` is the full
base64url SHA-256 of the domain-separated bytes
`shield:may-temporary:v1\0${sessionId}\0${toolCallId}`.

Do not change the executor regex, target-write algorithm, authority contracts,
or recovery semantics.

## Executor-owned cleanup

In `packages/shield-team-system/scripts/model/may-tool-executor.mjs`, correct
temporary cleanup so it never unlinks an entry this invocation did not create.
Establish ownership only after exclusive no-follow creation succeeds; retain
the created handle's regular-file device/inode identity; in `finally`, unlink
only when the current non-symlink regular path still matches that owned
identity. Successful rename leaves no temporary path to clean. Pre-existing or
substituted regular files and symlinks must remain untouched.

## Regression test

Add one test to
`packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs` that uses
the real dispatcher, imported production May control loop, and real May tool
executor against a disposable Git repository. Mock only the model HTTP
responses. Drive exactly one absent-file write, one successful shell-free Node
validation, and one final response. Assert dispatcher completion, exact bytes,
ordered tool completion, and no leaked `.shield-may-*.tmp` file.

The production execution chain in this test is dispatcher → May control loop →
May tool executor. Retain existing fixture doubles for journal/review/receipt,
Delivery Workspace, Helicarrier, permission/audit/control stores, mission-cycle
wrapper, and terminal readback; do not claim those are integrated by this test.

Add focused executor tests proving regular-file and symlink collisions remain
untouched, external symlink targets remain untouched, same-identity retries
continue failing while the collision exists, and a substituted temporary path
is not removed during cleanup.

Reuse existing test contracts and helpers where they remain truthful. Do not
invent production APIs or a new test directory. Stop if the work requires
authority widening or any path outside the four approved files.

Run the focused test, full package suite, build, and `git diff --check`. Report
only observed results. Do not run #137's external fixture or enter #29.
