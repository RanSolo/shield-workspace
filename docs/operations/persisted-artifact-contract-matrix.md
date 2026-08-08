# Persisted artifact contract matrix

This matrix records every persisted artifact introduced by the #242 mission
evidence tools. All five artifacts are non-authoritative and use
`authority:none` semantics. “Reject” means fail closed; no predecessor is
silently upgraded.

| Artifact | Producer | Consumers | Schema/version | Unknown fields | Digest bindings | Supported predecessors | Rejected predecessors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Acceptance spec | External mission planning process; immutable input to `shield-ops` | `evidence-run` and `acceptance-check` | Closed `mission-acceptance-spec`, version 1 | Reject at every object level | Caller supplies SHA-256 of exact bytes; runner receipt and evidence manifest bind it | Version 1 only | Missing version, prototype/open contracts, and every version other than 1 |
| Evidence manifest | Post-run evidence assembly process | `acceptance-check` | Closed `mission-evidence-manifest`, version 1 | Reject at every object level | Binds exact spec SHA-256; each mapping binds criterion, phase, command, expected revision, unique receipt ID, and exact receipt-byte SHA-256 | Version 1 only | Embedded spec evidence, missing version, reused IDs/digests/paths, and every version other than 1 |
| Evidence receipt | `evidence-run` | Evidence-manifest producer and `acceptance-check` | Closed `mission-command-evidence`, version 1 | Reject at every object level | Binds spec, command, actual root/branch/HEAD/clean state before and after, timeout/result, stored output text hashes, artifact hashes, and runner identity/file hash | Version 1 only | `local-command-evidence` prototype/hand-written receipts, missing version, and every version other than 1 |
| Acceptance report | `acceptance-check` | Human and technical reviewers; archival/reporting tools | Closed `acceptance-traceability`, version 1 | Producer emits only the documented fixed field set; strict consumers reject unknown fields | Records exact spec and manifest byte SHA-256 values and the receipt ID/digest summaries used for the result | Version 1 only | Prototype reports using `contractPath`/`contractSha256`, missing version, and every version other than 1 |
| Acceptance Markdown summary | `acceptance-check` from the same in-memory result as the JSON report | Human and technical reviewers; presentation-only consumers | UTF-8 Markdown summary; no JSON schema or machine-readable schema version | Not applicable; headings, prose, and table layout are presentation content | Displays mission, phase, disposition, evidence classification, expected revision, criterion counts, and findings; it does not embed the spec, manifest, or receipt digests | No compatibility guarantee beyond the current human-readable presentation | Must not be consumed as the closed JSON acceptance report or treated as a versioned machine contract |

The acceptance report communicates structural traceability only. It is not an
authority record, provenance record, execution attestation, signature, or human
acceptance decision.
