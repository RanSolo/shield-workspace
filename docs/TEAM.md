# Team & Operating Workflow

## Team Roles

The team operates with clear role separation to prevent scope creep and ensure quality. Each role has distinct responsibilities and decision rights.

| Role | Responsibility | Decision Rights |
|------|---------------|-----------------|
| **Product Owner** (Maverick) | Owns product direction, defines MVP scope, approves the Flight Plan and individual epics. Makes final decisions on product matters. | Final say on what we build and in what order. |
| **Architect** (Viper) | Designs system architecture, defines roadmap and epic boundaries, converts approved plans into implementation issues. | Final say on how we build it. |
| **Reconnaissance** (Jester) | Gathers facts about requirements or codebase state. Produces evidence-based reports. Does not recommend solutions. | None — produces facts, not recommendations. |
| **Implementation** (Iceman) | Executes against approved issues. Writes code, creates PRs, handles repository operations. Operates in disciplined execution mode. | Final say on implementation details within approved scope. |

### Why Role Separation Matters

Every member has a distinct role. Mission success depends on respecting those boundaries, not blurring them. When roles overlap, scope creep and decision paralysis follow.

## Operating Workflow

Every change follows the same lifecycle:

```
Reconnaissance → Planning → Approval → Implementation → Review
```

### Reconnaissance

Understand the current repository before proposing changes. Gather facts, not opinions. Produce evidence-based reports that separate reality from assumption.

**Output:** Evidence-based report (e.g., REPOSITORY_STATE_REPORT.md)

### Planning

Define product direction, architecture, and implementation approach. The output is a document — not a branch. Scope, epics, and success criteria are agreed upon before code is written.

**Output:** Approved plan document (e.g., FLIGHT_PLAN.md)

### Approval

Review the proposed work and confirm scope before implementation begins. No implementation starts without approval. This prevents two failures: building the wrong thing quickly, and debating implementation details before agreeing on what "done" looks like.

**Output:** Approved plan, ready for execution.

## Operational Approval Gate

Write operations require an explicit approval gate before execution. The standard workflow is:

```
Mission → Plan → Exact Commands → Approval → Execution → After Action Report
```

Approval is required before operations that mutate the repository or external systems, including:

- GitHub Issues
- Repository file changes
- Branch creation
- Commits
- Pull Requests
- Dependency installation or removal
- Database migrations
- Infrastructure changes
- Browser automation
- Destructive shell commands

Read-only analysis, repository inspection, and documentation review do not require approval.

## After Action Report

Every completed mission should end with a concise report:

- **Mission:** What was requested.
- **Result:** Success, partial, or failed.
- **Changes Made:** What changed.
- **Changes Not Made:** What was intentionally left untouched.
- **Unexpected Findings:** Anything discovered during execution.
- **Recommended Next Step:** The next logical action, if any.

### Implementation

Complete approved work in small, focused missions. Each GitHub issue represents a focused, independently reviewable unit of work. Shipped is better than perfect.

**Output:** Merged PR against approved issue.

## Test-Driven Implementation

Implementation should prefer a test-first workflow when practical.

For each implementation issue, Iceman should:

1. Identify the behavior being changed.
2. Add or update the smallest meaningful test that captures the expected behavior.
3. Run the test and confirm it fails for the right reason when appropriate.
4. Implement the change.
5. Run the relevant test command again.
6. Report test results in the After Action Report.

If the repository does not yet have the right test infrastructure, the mission should either:

* add the smallest reasonable test setup needed for the approved scope, or
* document why testing was not added and what future test coverage is recommended.

Testing should be proportional to the mission.

Do not block small documentation-only changes on full test infrastructure.

### Review

Verify implementation against the original success criteria. Update documentation. Capture lessons learned. Close the loop.

**Output:** Verified implementation, updated docs, closed issue.

## Documentation Hierarchy

When documents disagree, update the lower-level document to match the higher-level decision unless a new architectural decision has been approved.

1. **Flight Plan** — Strategic source of truth. Defines where the product is going.
2. **Repository State Report** — Reality check. Describes where the codebase is today.
3. **Architecture** — Implementation guidance. Explains how the system is built. Current file: `TECHNICAL_DESIGN.md`.
4. **GitHub Issues** — Tactical tracking. Approved implementation work.

## Project Principles

- Build software people are grateful exists.
- Delight over parity.
- Platform before vertical.
- Vertical depth before horizontal breadth.
- Small, complete missions.
- Evidence before assumptions.
- Shipped beats perfect.
