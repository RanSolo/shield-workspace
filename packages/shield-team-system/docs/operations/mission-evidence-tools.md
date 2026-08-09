# Mission evidence tools

These tools were promoted from ignored, mission-local prototypes after the
NXT-449 PDF-library Feature Flight exercised them across independent POC lanes.
They remain a separate `shield-ops` surface. Version 2 output reports advisory
structural consistency with `authority:none`, `producerAuthentication:false`,
`effectContainment:uncertain`, and `gateEligible:false`. It is never provenance,
an execution attestation, human acceptance, or permission to act.

## Freeze the acceptance spec

Create the acceptance spec before running evidence. Version 2 is a closed JSON
schema: unknown or missing fields fail acceptance. Its top-level fields are
`schemaVersion`, `specType`, `missionId`, `source`, `repository`, `commands`, and
`criteria`.

- `specType` is `mission-acceptance-spec`. `repository` contains the canonical
  absolute `root` and exact `branch`.
- Every command has a unique `id`, absolute `executable`, exact `argv`, bounded
  `timeoutMs` (1 through 3,600,000), and repository-relative `artifacts`.
- Credential-bearing argv is rejected before execution. This includes sensitive
  flags, assignments, structured JSON keys, known token forms, and JWTs. Use
  non-persisted secret references outside this tool instead.
- Automated criteria declare `testPaths`, assigned `commandIds`,
  `negativeCaseRequired`, and `negativeTestPaths`. Manual criteria declare a
  `procedure` and `expectedResult`.
- The SHA-256 is over the spec's exact bytes. Supply that digest independently
  to both commands; neither command discovers or accepts an expected digest
  from the spec itself.

The spec declares what may be measured. It grants no permission. Permission to
run a command must already exist through the caller and operating system and is
not enlarged by the spec or these tools.

## Capture an exact command receipt

`evidence run` snapshots the spec once, verifies the independently supplied
digest, selects one declared command ID, and executes only that command's exact
executable and argv without a shell. Stdin is disabled. The environment is
reduced to a non-credential process allowlist, output is bounded and redacted,
and the declared timeout is enforced.

```bash
mkdir -m 700 /absolute/path/to/evidence
umask 077
: > /absolute/path/to/evidence/package-tests.json
npx shield-ops evidence run \
  --spec /absolute/path/to/acceptance-spec.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --command-id package-tests \
  --output /absolute/path/to/evidence/package-tests.json
```

Version 2 receipts are closed and bind the spec digest, command ID, exact
executable/argv, actual canonical repository root and branch before and after,
clean before and after HEAD, timeout and truthful result state, redacted output
and hashes, declared artifact results and hashes, plus the `evidence-run`
path/version/file hash. Receipt output must be outside the measured repository;
the output target is resolved and rejected before command execution if it is
inside the repository, including through a canonical alias. Arguments are
recorded exactly after credential-bearing argv is rejected. Credential-like and
structured-JSON output is redacted, and credential environment variables are not
forwarded. Child and detached-process effects are not OS-contained, so every
receipt remains containment-uncertain and ineligible for any gate.

## Create the post-run evidence manifest

Evidence mappings do not modify the frozen spec. Create a separate closed
`mission-evidence-manifest` with these exact top-level fields:

`schemaVersion`, `manifestType`, `missionId`, `specSha256`, `phase`,
`expectedRevision`, `receipts`, `redNotApplicable`, and `manualEvidence`.

Each receipt mapping contains exactly `criterionId`, `phase`, `commandId`,
`receiptId`, `receiptSha256`, `path`, and `expectedRevision`. Paths are relative
to the manifest directory. Receipt IDs, byte digests, and paths may not be
reused. RED receipts structurally record a completed nonzero result. GREEN
receipts structurally record a completed zero result with every artifact
accounted for. A GREEN
manifest retains the prior RED mappings (or one rationale per applicable
criterion) and adds GREEN and manual evidence.

RED and GREEN are traceability labels only. They are not acceptance states.
Duplicate detection is local to one manifest/check invocation; cross-manifest
replay can remain structurally consistent, but it never gains freshness,
producer identity, containment, or gate eligibility. `performedBy` is preserved
only as a caller-asserted, unverified manual attribution.

## Check RED or GREEN traceability

`acceptance check` snapshots the spec, manifest, and every mapped receipt once.
It rejects spec digest drift, open or incomplete schemas, mapping or manifest
binding errors, receipt-set mismatch or reuse, wrong command/repository/branch/
tool identity, dirty or changed Git state, stale revisions, output hash changes,
and incomplete RED/GREEN/manual evidence.

```bash
umask 077
: > /absolute/path/to/evidence/acceptance.json
: > /absolute/path/to/evidence/acceptance.md
npx shield-ops acceptance check \
  --spec /absolute/path/to/acceptance-spec.json \
  --manifest /absolute/path/to/evidence/manifest.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --phase green \
  --expected-revision "$(git rev-parse HEAD)" \
  --report /absolute/path/to/evidence/acceptance.json \
  --markdown /absolute/path/to/evidence/acceptance.md
```

## Reserved-output persistence

Receipt, report, and Markdown outputs require an existing canonical parent and a
caller-reserved empty, non-symlink regular target with exact mode `0600`.
Missing, nonempty, permissive, or symlink targets are rejected. The writer binds
the reserved target inode and retained parent-directory handle before writing,
rechecks both around the write, syncs both handles, and rolls the retained target
back to empty on post-write uncertainty. It never creates or unlinks an output
path. Inputs are read through one retained non-symlink file handle.

Neither command signs, authorizes, dispatches, advances a journal, publishes,
merges, deploys, releases, or establishes provenance or execution attestation.
Version 1 and older hand-written artifacts are intentionally rejected by the
closed version 2 contracts; there is no silent migration. A structurally
consistent result is still `gateEligible:false` and cannot satisfy Coulson,
Fitz, Simmons, QA, merge, deployment, release, or final acceptance.
