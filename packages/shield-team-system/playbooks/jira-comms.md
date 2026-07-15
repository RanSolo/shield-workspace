# Jira Comms Protocol

Use this playbook when **Jemma Simmons (Product Feedback)** is carrying product review or feedback through Jira.

## Ownership

- **Jemma Simmons** represents the Jira-side review thread.
- **Maria Hill** gathers ticket state, drafts updates, and tracks waiting/resolved status.
- **Phil Coulson** decides the response when scope, priority, or acceptance changes.
- **Nick Fury** provides architecture or design rationale when needed.
- **Daisy Johnson** provides evidence for bug or defect questions.
- **Melinda May** provides implementation status and exact change summaries.

## Standard Jira states

- **Waiting on us** — Jira comment or product review requires a response.
- **Waiting on Simmons** — response is drafted and pending external review or approval.
- **Waiting on product** — team replied and is waiting on product follow-up.
- **Resolved** — review feedback is answered or accepted.

## Response routing

- **Product / acceptance / scope** -> Phil Coulson
- **Architecture / technical approach** -> Nick Fury
- **Bug evidence / defect clarification** -> Daisy Johnson
- **Implementation status / what changed** -> Melinda May
- **Administrative update / coordination / status push** -> Maria Hill

## Response template

Maria Hill or Jemma Simmons should structure Jira updates as:

1. **Context** — what request or review comment is being addressed
2. **Current status** — implemented / investigating / pending / blocked
3. **Decision or answer** — what the team is saying back
4. **Impact** — scope, behavior, or release implications
5. **Next step** — what the team or product should expect next

## CLI foundation

Use the scripts in [scripts/jira/](../scripts/jira):

- [product-review-queue.sh](../scripts/jira/product-review-queue.sh) — list Jira items needing product review attention
- [coulson-sprint-tickets.sh](../scripts/jira/coulson-sprint-tickets.sh) — list current sprint issues, Phil Coulson-assigned issues, unclaimed issues, or a triage combination
- [draft-product-review-response.sh](../scripts/jira/draft-product-review-response.sh) — generate a structured Jira response template

For recurring review sweeps, use:

- [fitz-simmons-review-sweep.sh](../scripts/daily-briefing/fitz-simmons-review-sweep.sh)

## Environment expectations

For live Jira checks, set:

- `JIRA_BASE_URL`
- `JIRA_USER_EMAIL`
- `JIRA_API_TOKEN`

Optional:

- `JIRA_PRODUCT_REVIEW_JQL`
- `JIRA_COULSON_EMAIL`
- `JIRA_MAX_RESULTS`

Compatibility aliases still accepted:

- `JIRA_MAVERICK_EMAIL`
- `JIRA_MAVERICK_MODE`

The scripts fail loudly if required credentials are missing.
