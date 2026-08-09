# Mission evidence tools

These tools were promoted from ignored, mission-local prototypes after the
NXT-449 PDF-library Feature Flight exercised them across independent POC lanes.
They remain a separate `shield-ops` surface. Their output is contract-relative
structural evidence with `authority:none`; it is never provenance, an execution
attestation, human acceptance, or permission to act.

## Freeze the acceptance spec

Create the acceptance spec before running evidence. Version 1 is a closed JSON
schema: unknown or missing fields fail acceptance. Its top-level fields are
`schemaVersion`, `specType`, `missionId`, `source`, `repository`, `commands`, and
`criteria`.

- `specType` is `mission-acceptance-spec`. `repository` contains the canonical
  absolute `root` and exact `branch`.
- Every command has a unique `id`, absolute `executable`, exact `argv`, bounded
  `timeoutMs` (1 through 3,600,000), and repository-relative `artifacts`.
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
npx shield-ops evidence run \
  --spec /absolute/path/to/acceptance-spec.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --command-id package-tests \
  --output /absolute/path/to/evidence/package-tests.json
```

Version 1 receipts are closed and bind the spec digest, command ID, exact
executable/argv, actual canonical repository root and branch before and after,
clean before and after HEAD, timeout and truthful result state, redacted output
and hashes, declared artifact results and hashes, plus the `evidence-run`
path/version/file hash. Receipt output must be outside the measured repository;
the output target is resolved and rejected before command execution if it is
inside the repository, including through a canonical alias. Arguments are
recorded exactly, so credentials and secrets must never be placed in the spec or
argv. Credential-like output is redacted, and credential environment variables
are not forwarded.

## Create the post-run evidence manifest

Evidence mappings do not modify the frozen spec. Create a separate closed
`mission-evidence-manifest` with these exact top-level fields:

`schemaVersion`, `manifestType`, `missionId`, `specSha256`, `phase`,
`expectedRevision`, `receipts`, `redNotApplicable`, and `manualEvidence`.

Each receipt mapping contains exactly `criterionId`, `phase`, `commandId`,
`receiptId`, `receiptSha256`, `path`, and `expectedRevision`. Paths are relative
to the manifest directory. Receipt IDs, byte digests, and paths may not be
reused. RED receipts must show a completed nonzero result. GREEN receipts must
show a completed zero result with every artifact accounted for. A GREEN
manifest retains the prior RED mappings (or one rationale per applicable
criterion) and adds GREEN and manual evidence.

## Check RED or GREEN traceability

`acceptance check` snapshots the spec, manifest, and every mapped receipt once.
It rejects spec digest drift, open or incomplete schemas, mapping or manifest
binding errors, receipt-set mismatch or reuse, wrong command/repository/branch/
tool identity, dirty or changed Git state, stale revisions, output hash changes,
and incomplete RED/GREEN/manual evidence.

```bash
npx shield-ops acceptance check \
  --spec /absolute/path/to/acceptance-spec.json \
  --manifest /absolute/path/to/evidence/manifest.json \
  --expected-spec-sha256 "$EXPECTED_SPEC_SHA256" \
  --phase green \
  --expected-revision "$(git rev-parse HEAD)" \
  --report /absolute/path/to/evidence/acceptance.json \
  --markdown /absolute/path/to/evidence/acceptance.md
```

## Create-only persistence

Receipt, report, and Markdown outputs require an existing canonical parent
directory. Symlinked parents and existing targets (including target symlinks)
are rejected. Files are opened create-only at mode `0600`, written and synced
through the retained handle, closed, and followed by a parent-directory fsync.
Inputs are read through one retained non-symlink file handle, avoiding path
rereads after snapshot.

Neither command signs, authorizes, dispatches, advances a journal, publishes,
merges, deploys, releases, or establishes provenance or execution attestation.
Older hand-written prototype receipts are intentionally rejected by the closed
version 1 contract.

For the tools used before a multi-mission launch, see
[Feature Flight preflight tools](./feature-flight-preflight-tools.md).
