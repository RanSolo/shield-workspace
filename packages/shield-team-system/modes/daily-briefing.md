# Daily Briefing

Recurring review-and-comms sweep for Maria Hill, Leo Fitz, and Jemma Simmons.

Use this mode for:

- checking Jira product review queues
- checking GitHub review state
- checking external wait states
- producing a lightweight daily action list

## Lead seat

**Maria Hill (Orchestrator)** leads the operational sweep.
**Leo Fitz (Technical Review)** represents GitHub technical review state.
**Jemma Simmons (Product Feedback)** represents Jira, docs, and product feedback state.

## Flow

1. **Maria Hill queue sweep**
   - run Jira product review checks
   - run GitHub review checks
   - identify anything blocked on Fitz or Simmons

2. **Classification**
   - waiting on us
   - waiting on product
   - waiting on technical review
   - waiting on product feedback
   - resolved

3. **Routing**
   - scope/product answer needed -> Phil Coulson
   - architecture answer needed -> Nick Fury
   - bug evidence answer needed -> Daisy Johnson
   - implementation status answer needed -> Melinda May
   - simple response/status push -> Maria Hill

4. **Review comms**
   - send or prepare Jira/GitHub/Atlassian/direct comms updates
   - mark what is still pending

## Standard commands

Start with:

- [fitz-simmons-review-sweep.sh](../scripts/daily-briefing/fitz-simmons-review-sweep.sh)
- [product-review-queue.sh](../scripts/jira/product-review-queue.sh)
- [coulson-sprint-tickets.sh](../scripts/jira/coulson-sprint-tickets.sh)

## Output

Daily Briefing should end with:

- open Jira product review items
- open GitHub review items
- who needs to answer next
- what Fitz or Simmons still have pending
