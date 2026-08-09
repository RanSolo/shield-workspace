# NXT-449 Feature Flight experiment report

## Scope and evidence status

This report closes the NXT-449 self-tooling experiment with portable SHIELD
process evidence only. It contains no company source, customer data,
credentials, signer material, passcodes, or host-specific paths.

The repository contains two different evidence classes:

- The promoted tool history is retrievable from the content-addressed Git
  commits listed below.
- The final registry and harvest are retrievable machine-readable artifacts
  whose exact byte digests are listed below.

Earlier operational observations were reported in mission conversations, but
their source receipts, journals, fixture package, and measurement logs are not
committed or otherwise linked from this repository by a retrievable locator.
They are therefore labelled **unverified historical report** here. A digest
without a retrievable object is identity metadata, not independently replayable
evidence.

## Retrievable promoted-tool history

Each exact commit is an ancestor of this report's repaired history and can be
inspected with `git show COMMIT`.

| Pull request | Retrievable exact commit                   | Purpose                                                                 |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| #242         | `d0885aef9213577fa34b7958b36bc7f2f012cb1f` | Mission command receipts and acceptance traceability                    |
| #243         | `c2c872a21f2ba790f3b5dca49f9f67c61161b434` | Flight preflight, fixture closure, construction observation, and doctor |
| #244         | `62afbd5c842670336f37522833f60f6814728de3` | Non-authoritative state initialization and advisory Hill routing        |
| #245         | `fbdc15e649bb4ddcec1e86672f62ad0c35df80ae` | Exact handoffs, convergence checks, and teardown planning               |
| #246         | `1f892cf5c7367b84bb7a927e970dd6bb95618e95` | Final reviewed/pushed harvest contract and portable artifact hardening  |

The final machine-readable artifacts are:

| Artifact                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [Tool registry](./nxt-449-tool-registry.json) | `fba835d2b3c64b5898d99dcb8919b03c27d2e1e2ea74cfc0e54048bef9a47bc2` |
| [Tool harvest](./nxt-449-tool-harvest.json)   | `0ae8a05d2d5df145cea52f2713dec303ae6895e69aa35a1cee3a79913c03cef4` |

The harvest binds the registry's exact bytes and 14 checked-in tool artifacts.
Its artifact paths are repository-relative, its `artifactRoot` is portable, and
it contains no canonical host paths. Replay with the checked-in dispatcher:

```bash
node packages/shield-team-system/scripts/operations/ops-cli.mjs tool harvest \
  --registry docs/experiments/nxt-449-tool-registry.json \
  --output /absolute/path/to/new-harvest.json
```

A byte comparison between that new output and the committed harvest verifies
structural self-consistency and exact tool snapshots. It grants no authority
and does not prove the historical experiment observations below.

## Unverified historical report

The following claims are retained for context, explicitly without independent
verification from retrievable source evidence in this repository:

| Historical claim                                                                                                                                     | Status                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Four PDF-library POC lanes and one final comparison/ADR mission were declared.                                                                       | **Unverified historical report.**                                                   |
| Two implementation lanes ran concurrently.                                                                                                           | **Unverified historical report.**                                                   |
| One synthetic fixture was reused by PDFMake and React PDF lanes and reserved for later POCs.                                                         | **Unverified historical report.**                                                   |
| Two first-wave lanes used reviewed RED and exact-head GREEN workflows.                                                                               | **Unverified historical report.**                                                   |
| Full-document lanes used three warmups and twenty measured generations.                                                                              | **Unverified historical report.**                                                   |
| A focused validation run passed 30 of 30 tests.                                                                                                      | **Unverified historical report; no exact-revision test receipt is linked here.**    |
| The registry's declared known reuse counts sum to 15; dispatcher reuse is unknown.                                                                   | **Structurally preserved declaration, not independently verified usage telemetry.** |
| Setup elapsed time, token cost, disk cost, and elapsed-time savings were not captured trustworthily.                                                 | **Unknown (`null`) in the final harvest where represented.**                        |
| Human interventions included Wheels Up signing, manual visual inspection, cross-chat relay, and correction of a preimplementation revision boundary. | **Unverified historical report; no human decision is inferred or recreated.**       |
| Chats observed stale gates after journals advanced elsewhere.                                                                                        | **Unverified historical report; exact event count is unknown.**                     |

Previously reported standalone digests for the experiment base, fixture
manifest, resolved plan, evaluation contract, fixture binding, and bootstrap
receipt are omitted because this repository does not provide retrievable
content-addressed locators for those objects. Their former digest strings alone
could not support replay.

## Findings and limits

The retrievable tools demonstrate closed-schema validation, exact input and Git
snapshot binding, portable tool harvesting, advisory routing, convergence
replay, and non-destructive teardown classification. Those are structural or
exact-snapshot properties only. They do not establish latest state, trusted
human authority, provenance, or execution attestation.

The historical account suggests that shared fixtures and evidence vocabulary
reduced repeated coordination and that chat relay was weaker than journal
replay, but those conclusions remain unverified until linked source evidence is
made retrievable.

The registry recommendations are advisory `promotion-candidate` dispositions.
Fury technical review is non-authoritative. Only Phil Coulson's authorized
human occupant can grant applicable mission or publication authority; Leo Fitz
and conditional Jemma Simmons reviews remain decisions of their authorized
human occupants.

The experiment does **not** implement Helicarrier construction, isolated
dependency environments, trusted successor-state updates, journal-backed relay
delivery, automatic downstream-base refresh, domain compatibility execution,
cumulative test execution, merge, deployment, release, or cleanup. A passing
structural report or exact snapshot must not be described as one of those
effects.
