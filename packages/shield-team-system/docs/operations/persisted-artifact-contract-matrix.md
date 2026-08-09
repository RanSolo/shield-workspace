# Persisted artifact contract matrix

This matrix records every persisted artifact introduced by the #242 mission
evidence tools. All five artifacts are non-authoritative and use
`authority:none`, `effectContainment:uncertain`, and `gateEligible:false`
semantics. “Reject” means fail closed; no predecessor is
silently upgraded.

| Artifact | Producer | Consumers | Schema/version | Unknown fields | Digest bindings | Supported predecessors | Rejected predecessors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Acceptance spec | External mission planning process; immutable input to `shield-ops` | `evidence-run` and `acceptance-check` | Closed `mission-acceptance-spec`, version 2 | Reject at every object level | Caller supplies SHA-256 of exact bytes; runner receipt and evidence manifest bind it | Version 2 only | Version 1, missing version, prototype/open contracts, and every other version |
| Evidence manifest | Post-run evidence assembly process | `acceptance-check` | Closed `mission-evidence-manifest`, version 2 | Reject at every object level | Binds exact spec SHA-256; each mapping binds criterion, phase, command, expected revision, unique receipt ID, and exact receipt-byte SHA-256 | Version 2 only | Version 1, embedded spec evidence, missing version, reused IDs/digests/paths, and every other version |
| Evidence receipt | `evidence-run` | Evidence-manifest producer and `acceptance-check` | Closed `mission-command-evidence`, version 2 | Reject at every object level | Binds spec, command, root/branch/HEAD/clean state, result, output, artifacts, and tool hash; explicitly does not authenticate the producer or contain effects | Version 2 only | Version 1, hand-written receipts, missing version, and every other version |
| Acceptance report | `acceptance-check` | Human and technical reviewers; archival/reporting tools | Closed `acceptance-traceability`, version 2 | Producer emits only the documented fixed field set | Records exact spec/manifest digests and receipt summaries; reports `structurallyConsistent` and always `gateEligible:false` | Version 2 only | Version 1, `ok`/PASS reports, missing version, and every other version |
| Acceptance Markdown summary | `acceptance-check` from the same in-memory v2 result | Human and technical reviewers; presentation-only consumers | UTF-8 Markdown summary tied to v2 | Not applicable | Displays STRUCTURALLY_CONSISTENT or INCONSISTENT, never PASS | Current v2 presentation only | Version 1 PASS summaries and machine consumption |

The acceptance report communicates structural traceability only. It is not an
authority record, provenance record, execution attestation, signature, or human
acceptance decision.

Receipt duplicate checks are manifest/invocation-local. Cross-manifest replay
may remain structurally consistent. No artifact establishes freshness, trusted
producer identity, trusted manual identity, effect containment, or gate
eligibility; manual `performedBy` values are caller-asserted and unverified.
