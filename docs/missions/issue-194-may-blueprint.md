# May blueprint — issue #194

Implement only the Fury-approved issue #194 plan.

## Production change

In `packages/shield-team-system/src/governed-may-dispatch-v1.mts`, remove the
temporary counter and make `nextTemporaryName` accept `{ sessionId,
toolCallId }`. Return `.shield-may-${digest}.tmp`, where `digest` is the full
base64url SHA-256 of the domain-separated bytes
`shield:may-temporary:v1\0${sessionId}\0${toolCallId}`.

Do not change the executor regex, file-write algorithm, cleanup behavior,
authority contracts, or recovery semantics.

## Regression test

Add one test to
`packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs` that uses
the real dispatcher, imported production May control loop, and real May tool
executor against a disposable Git repository. Mock only the model HTTP
responses. Drive exactly one absent-file write, one successful shell-free Node
validation, and one final response. Assert dispatcher completion, exact bytes,
ordered tool completion, and no leaked `.shield-may-*.tmp` file.

Reuse existing test contracts and helpers where they remain truthful. Do not
invent production APIs or a new test directory. Stop if the real-composition
test requires authority widening or any path outside the two approved files.

Run the focused test, full package suite, build, and `git diff --check`. Report
only observed results. Do not run #137's external fixture or enter #29.
