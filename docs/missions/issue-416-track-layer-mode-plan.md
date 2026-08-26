# Issue #416 — Track-Layer Mode: bounded existing-rail repair

## Exact planning identity

- Issue: [#416](https://github.com/RanSolo/shield-workspace/issues/416)
- Repository: `RanSolo/shield-workspace`
- Planning branch: `agent/issue-416-track-layer-mode`
- Planning HEAD: `56be6a7cad835eab927d880de108541eeeae353c`
- Authority: `none`
- Hill-observed issue evidence: [Issue #416](https://github.com/RanSolo/shield-workspace/issues/416)
- Governing related principle: [Issue #99](https://github.com/RanSolo/shield-workspace/issues/99)

## Governing interpretation

Track-Layer Mode builds the delivery system; ordinary Delivery Mode uses it. It covers both repair of concrete defective SHIELD rails and construction of genuinely new rail segments, but those are separate authority classes. A new rail requires its own frozen construction contract before activation. An incomplete rail cannot be required to certify its own repair.

## One selected existing-rail failure

This slice repairs only the publication-preparation gap proven by #406/#408: exact #406 implementation HEAD `400a60a0eb4bf6dbf549b08e3b99a89572a57cec` has truthful manual Break Glass provenance, Mack PASS, and hosted Fury APPROVE, but the canonical publication graph requires implementation authority, runtime binding, and publication authorization and therefore cannot derive the real Coulson draft-PR PIN without fabricating a receipt or journal history. The related prerequisite is [Issue #408](https://github.com/RanSolo/shield-workspace/issues/408).

## Bounded repair contract

Define one repository-owned, authority-none break-glass publication-preparation contract. It must bind the manual decision text/provenance, exact plan and transition digests, exact implementation HEAD, approved paths and exclusions, exact Mack/Fury evidence, and only `review.branch.push` plus `review.pull_request.create_draft`. It must derive the normal Coulson publication PIN input without fabricating signatures, receipts, or journal entries, and must leave ordinary graph-backed publication unchanged.

One writer owns the repair ledger and evidence append. Each record is immutable, canonically digested, exact-revision bound, and single-consumer. The unchanged failed #406 publication preparation operation is replayed as the terminal acceptance case: the repair must prove the same failure is admitted only through the bounded contract, with no evidence rewrite, receipt replay, authority widening, or unrelated effect.

## Explicit exclusions

No parallel crews, promotion machinery, new seat cards, new-rail activation, implementation of unrelated SHIELD rails, issue closure, GitHub mutation beyond the separately authorized human-reviewed PR, merge, deployment, release, or final acceptance. No repair may consume the incomplete rail as its own certifier. Human review and decision remain required before PR publication and all later effects.

## Required evidence and validation

- one exact writer and immutable repair-ledger/evidence contract;
- exact plan, transition, implementation, Mack, and Fury bindings with fail-closed stale/conflict handling;
- unchanged failed operation replayed without mutation or receipt replay;
- focused cache-enabled Nx validation;
- independent Mack exact-revision validation;
- Fury exact-revision conformance;
- human-reviewed PR gate before any publication effect.

This is an authority-none planning artifact. It grants no implementation, publication, merge, deployment, release, or final-acceptance authority.
