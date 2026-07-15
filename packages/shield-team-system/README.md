# shield-team-system

This repository is the canonical portable source for the team-system framework.

The initial baseline was extracted and sanitized from an existing working setup.
Original source locations remain unchanged.

This baseline uses the approved S.H.I.E.L.D. team mapping and keeps the team
responsibilities, review gates, and operating workflow portable across repos.

## Mission modes

- **Debugger Mode** handles defect investigation when the correct change is not
  yet known.
- **Delivery Mode** handles planned engineering work from approved requirements
  through a review-ready pull request.

Maria Hill selects the matching mode from `modes/mission-modes.md` and loads it
only for participating seats.

## Migration Notes

Issue `#1` completes the approved thematic migration from the older Top Gun
presentation to the SHIELD identities without redesigning the workflow.

Major renamed groups:

- `agents/`
  - seat files now use SHIELD identities such as Maria Hill, Daisy Johnson,
    Nick Fury, Melinda May, and Phil Coulson
  - the former Goose placeholder is split into
    `leo-fitz-technical-review.agent.md` and
    `jemma-simmons-product-feedback.agent.md`
- `modes/`
  - `sortie-modes.md` became `mission-modes.md`
  - `daily-sortie.md` became `daily-briefing.md`
- `scripts/daily-briefing/`
  - `goose-review-sweep.sh` became `fitz-simmons-review-sweep.sh`
- `scripts/jira/`
  - `maverick-sprint-tickets.sh` became `coulson-sprint-tickets.sh`

Compatibility aliases remain available in `scripts/model/README.md`,
`scripts/model/ask-local.mjs`, and `scripts/model/escalation.sh` so existing
seat invocations do not break during migration.

No company code, credentials, tickets, customer data, or session internals
belong in this repository.
