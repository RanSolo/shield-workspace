# NXT-449 Feature Flight experiment report

## Scope and identity

This report records the first multi-lane use of the promoted Feature Flight
operations. It contains only sanitized SHIELD process evidence; it contains no
company source, customer data, credentials, private paths, signer material, or
passcodes.

- Experiment: four PDF-library evidence POCs followed by one comparison/ADR
  mission.
- Frozen experiment base revision:
  `8a628a4add3e009fda2a0a6f3a535e10f29ffe1b`.
- Frozen synthetic fixture manifest SHA-256:
  `c4bc639fc77025c20a3754611c360369d89e9869ed814dc5cc086cc84ee1d3e7`.
- Resolved flight plan SHA-256:
  `fc679b77c0bf3ed3e20548408bada1c61dd8a6639cc66d2e341849a84447468e`.
- Evaluation contract SHA-256:
  `063324f6ea6b12fd6193de99942bf959a7a0a3a237ff02d12058269b82b9cf4e`.
- Fixture-binding SHA-256:
  `19b94b0e9e96f17e4294c568374547bdbc7f5448158409c6c84cda1ba82683f9`.
- Bootstrap receipt SHA-256:
  `166bf2e00fd1e0df5695b9d7d2d9a0f60e460f5f25e3983b0da29356960d180a`.

## Promoted tool stack

The tools were promoted as a reviewable stack ordered by lifecycle use:

| Pull request | Exact head                                 | Purpose                                                                 |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| #242         | `d0885aef9213577fa34b7958b36bc7f2f012cb1f` | Command receipts and RED/GREEN acceptance traceability                  |
| #243         | `c2c872a21f2ba790f3b5dca49f9f67c61161b434` | Flight preflight, fixture closure, construction observation, and doctor |
| #244         | `62afbd5c842670336f37522833f60f6814728de3` | Non-authoritative state initialization and deterministic Hill routing   |
| #245         | `fbdc15e649bb4ddcec1e86672f62ad0c35df80ae` | Exact handoffs, convergence checks, and teardown planning               |
| #246         | `b9180d70faa07cf3c23b71590c59ecd05d590011` | Experimental tool harvest and promotion evidence                        |

Tool artifact SHA-256 values at the top of that stack:

| Artifact                 | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `acceptance-check.mjs`   | `e60105a79e9411a38b1d89118721dae1468b9fb418cae2a9d4ded4244ddc0604` |
| `evidence-run.mjs`       | `6e548e8ab2cee7b14ec13b17dbbac004502a8c566957d416d03b804e94d057df` |
| `flight-prep.mjs`        | `e8e090fc4bd368e9036b9a0908fc3225b716ca101a545b337bbef52baa2b993b` |
| `fixture-build.mjs`      | `198099de8ecbea28509b60f9e575f84c3d79dacb0c3de2e6190742481472fa88` |
| `construction-check.mjs` | `45af6f7b908858116fdc0a86667aa0c41a9441400c0c7f624f482aa4eda06eac` |
| `flight-doctor.mjs`      | `cfde8a402ec6d215d1667053109ed81e5fba3fc4d6582d32bbccc54eec29caaa` |
| `flight-state-init.mjs`  | `a73320341731bf05a929f820aa27c6ff4b48397b6714ce5e1a1c76c4db9ea828` |
| `hill-kernel.mjs`        | `01b7a1c9d93ee7309464170f9b13a674bebbcb84c96fe4c97a44c5969d59f584` |
| `handoff-compile.mjs`    | `b64ae00561223cd572d0be7a0584880deffad442eb9c082a2c3d978eee318b8f` |
| `integration-check.mjs`  | `a9a9723afa222bc856b12b422e5e002601187dfe72fe08d2ef9d0bccd01a94b4` |
| `teardown-plan.mjs`      | `08d4868db7da0ca70aa12010abe6add205b5858e0e3a94ac7da3e106b0298295` |
| `tool-harvest.mjs`       | `cbd797d999333fa6e2b0f917f4b85ecff5697d3b4c25208839942783882e0d5f` |
| `ops-cli.mjs`            | `ff4aefca4f9b1521fa2a9e0df3b8ce84cf3603639898089414501f518dda74c9` |

## Observed results

| Measurement                              | Observed value                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POC lanes declared                       | 4 evidence lanes plus 1 final comparison mission                                                                                                                          |
| Concurrent implementation lanes observed | 2                                                                                                                                                                         |
| Frozen fixture reuse                     | One identical synthetic fixture contract used across independent PDFMake and React PDF lanes and reserved for the remaining POCs                                          |
| Acceptance reuse                         | Independent reviewed RED and exact-head GREEN workflows used in both first-wave lanes                                                                                     |
| Comparison protocol                      | Same acceptance vocabulary; 3 warmups and 20 measured generations for full-document lanes                                                                                 |
| Focused promoted-tool validation         | 30/30 tests passed                                                                                                                                                        |
| Setup elapsed time                       | `null` — no trustworthy start/end measurement was captured                                                                                                                |
| Token cost                               | `null` — no portable trustworthy measurement was captured                                                                                                                 |
| Disk cost                                | `null` — worktree, dependency, and artifact usage was not measured consistently                                                                                           |
| Repeated work avoided                    | Fixture generation, criterion traceability, evidence receipts, topology checks, routing computation, and handoff compilation were reused; elapsed-time savings are `null` |
| Human interventions                      | Wheels Up signing, manual visual inspection, cross-chat packet relay, and correction of a preimplementation revision boundary                                             |
| Stale coordination                       | Independent chats reported stale gates after authoritative journals advanced elsewhere; exact stale-message count is `null`                                               |

## Findings

1. Two bounded teams could implement comparable POCs concurrently while sharing
   a frozen synthetic fixture and evidence vocabulary.
2. The deterministic helpers reduced repeated context carrying and made missing
   paths, dependencies, exact revisions, acceptance criteria, and handoff
   evidence fail closed.
3. Governance state remained authoritative, but cross-chat delivery did not.
   The operator became a message bus when another chat did not observe a new
   signed journal event.
4. Acceptance preparation exposed a Mack lifecycle seam: the independent
   contract could be hash-frozen and reviewed, but the current mission registry
   could not claim a canonical Mack dispatch.
5. Wheels Up required a distinct preimplementation revision. One lane needed an
   empty boundary commit because construction had not deliberately created that
   revision.
6. One PDF preview appeared clipped while independent renderers and PDF parsing
   passed. The follow-up visual contract now requires exact PDF identity,
   independent rendering, parser/reopen evidence, named observations, and a
   renderer-disagreement disposition.

## Promotion disposition

The evidence, preflight, control, convergence, and harvest helpers are
`promotion-candidate` tools realized as draft PRs #242–#246. Their focused
tests and documentation justify review on a supported `shield-ops` surface,
but they remain non-authoritative. Human publication review decides whether
they become operable.

The experiment does **not** prove Helicarrier construction, isolated dependency
environments, validated state updates, journal-backed cross-chat delivery,
automatic downstream-base refresh, merge, deployment, release, or cleanup.
Those gaps remain future work rather than being inferred from successful POCs.
