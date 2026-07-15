# Technical Design: SHIELD Team System

## Status

This document describes the repository as it exists after the approved
S.H.I.E.L.D. thematic migration. The migration changes names and documentation,
but it does not redesign responsibilities, gates, or the operating workflow.

## Purpose

`shield-team-system` is a portable operating framework for human and AI software
delivery. It defines who investigates, who decides, who implements, how work is
validated, and when a human must intervene. Its governing principle is to
deliver the smallest safe change that fixes the confirmed problem.

The repository contains prompts, workflow modules, shell helpers, playbooks,
and scorekeeping. It does not contain an application runtime, company data,
credentials, or a fully autonomous agent service.

## Architecture

The framework has five layers:

1. **Charter** - `agents/shield-team-charter.agent.md` is the shared operating
   contract. It defines authority, handoffs, escalation, and safety rules.
2. **Seats** - files in `agents/` define focused responsibilities for the
   orchestrator, investigator, architect, implementer, human owner, technical
   review, and product feedback seats.
3. **Modes** - files in `modes/` adapt the charter to a class of work. Debugger
   Mode is the primary implemented workflow. Daily Briefing also exists for
   recurring review and communications sweeps; Feature Mission and Hotfix
   Response remain planned.
4. **Operations** - scripts in `scripts/` support model selection, Jira and
   GitHub coordination, review sweeps, and local-model calls.
5. **Evidence** - `scorecard.md`, plans, command output, tests, and external
   review states record what happened and whether a mission is ready to advance.

## Seat Boundaries

| Functional seat | SHIELD identity | Responsibility |
| --- | --- | --- |
| Orchestrator | Maria Hill | Intake, mode selection, routing, cheap checks, external-system coordination, and bookkeeping |
| Investigator | Daisy Johnson | Evidence collection, root-cause analysis, facts versus assumptions, and smallest-fix proposal |
| Architect | Nick Fury | Technical judgment, plan approval, risk review, and readiness decisions |
| Implementer | Melinda May | Scoped implementation of an approved plan and focused verification |
| Technical review | Leo Fitz | Human technical peer review and merge readiness comments through pull requests |
| Product feedback | Jemma Simmons | Jira, documentation, product, and domain feedback states |
| Human owner | Phil Coulson | Final authority over scope, risk, tradeoffs, credentials, and destructive actions |

The functional names are still accepted by the local adapter and provide a
stable interface across repositories. Legacy aliases remain available as
compatibility shims where that avoids needless breakage.

## Debugger Lifecycle

Debugger Mode uses seven stages:

1. The orchestrator classifies the defect and gathers inexpensive context.
2. The investigator examines evidence and proposes the smallest supported fix.
3. The architect approves, revises, or returns the mission for more evidence.
4. The implementer changes only the approved scope and adds focused tests when
   appropriate.
5. The orchestrator runs and records the repository validation gate.
6. The architect performs a readiness review.
7. Human review states are satisfied: Leo Fitz for technical review and Jemma
   Simmons when product or domain feedback is relevant.

Handoffs use a common shape: Context, Evidence, Plan, Validation, Risk, and Ask.
Ambiguous requirements, material risk, low confidence, or meaningful tradeoffs
escalate to the human owner.

## Model Routing

`scripts/model/escalation.sh` provides configurable cheap, standard, and strong
model tiers. Its current defaults name hosted models, but environment variables
can replace every tier. The helper is advisory: callers must still decide when
to escalate and invoke the selected model.

`scripts/model/ask-local.mjs` adds a model-agnostic LM Studio adapter. It:

- calls the native `/api/v1/chat` endpoint;
- defaults to the locally served `ornith-1.0-35b` model;
- maps functional, SHIELD, and legacy role aliases to existing seat prompts;
- accepts inline missions, mission files, stdin, and explicit context files;
- separates the actionable message from optional reasoning and statistics;
- supports optional API-token authentication;
- keeps calls stateless with `store: false`; and
- can save long responses for supervisor review.

The adapter does not currently grant terminal or repository tools to the local
model. A supervisor must supply authoritative context and execute approved
actions. This is deliberate in the first version and should not be described as
an autonomous coding loop yet.

## Safety Model

Current safety controls are primarily procedural. The charter and seat prompts
prohibit unapproved scope expansion, destructive operations, secret handling,
database resets, unrelated refactors, and unsupported claims. Human authority
and technical review remain mandatory at defined boundaries.

The local adapter strengthens privacy by using explicit context files and
stateless calls. It does not scan the repository automatically. These controls
reduce accidental disclosure, but prompt rules alone are not a security
boundary. Any future tool-enabled runner must enforce allowlists in code.

## Current Capabilities

- Shared charter and seven defined seats
- Debugger Mode and a Daily Briefing workflow
- Planned-mode index and repeatable handoff format
- Shell-based model escalation helper
- Jira, GitHub, and review-sweep operational scripts
- LM Studio native local-model adapter
- Node tests for role mapping and native response parsing
- Scorecard and planning artifacts

## Known Gaps

- The local model can advise but cannot independently inspect or modify the
  repository through this adapter.
- There is no bounded manager/worker/reviewer loop or persisted mission state.
- Model escalation selection is not yet wired automatically into the adapter.
- Automated coverage does not yet validate prompt links, mode integrity,
  shell-script behavior, or external integrations.
- Feature Mission and Hotfix Response are not implemented.

## Path Forward

1. Keep the functional seat identifiers as the stable API while allowing
   project-local model selection and themed presentation to vary by repo.
2. Add a bounded mission runner that records mission state and permits at most
   three repair cycles before human escalation.
3. Connect model-tier selection to the runner: use the local model for routing,
   investigation, drafting, and routine review; escalate high-risk or repeatedly
   failing work to the configured stronger model.
4. Introduce narrowly scoped tools through allowlisted MCP servers or explicit
   supervisor callbacks. Keep credentials, destructive Git actions, merge, and
   deployment behind human approval.
5. Expand automated checks for role references, mode links, shell helpers, and
   stop-condition enforcement before enabling unattended missions.
