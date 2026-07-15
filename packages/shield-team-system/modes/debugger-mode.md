# Debugger Mode

First module in the mission system.

Use this mode for:

- failing tests
- runtime bugs
- flaky behavior
- confusing application behavior
- build or type errors
- bug reports where the right fix is not yet clear

## Lead seat

**Daisy Johnson (Debugger/Recon)** leads the reasoning flow.
**Maria Hill (Orchestrator)** handles cheap operations, validation commands, and external coordination.

## Flow

1. **Maria Hill intake**
   - classify the bug
   - collect cheap context
   - identify likely systems involved
   - run cheap status/validation commands when helpful
   - use the Repository Context Discovery playbook when repo shape, test stack, or validation commands are still unclear

2. **Daisy Johnson investigation**
   - inspect relevant files, tests, and evidence
   - identify likely root cause
   - separate facts from assumptions
   - propose the smallest plausible fix plan

3. **Nick Fury review**
   - review evidence and plan
   - approve, revise, or send back for more investigation

4. **Melinda May implementation**
   - implement only the approved plan
   - update focused tests when appropriate
   - report exact changes and recommended validation
   - if blocked, report the blocker instead of handing implementation back to Maria Hill

5. **Maria Hill validation**
   - run the requested Nx lint/test/build/affected or focused checks
   - gather results
   - summarize for Nick Fury and Phil Coulson

## Stuck protocol

If Melinda May is blocked:

1. Melinda May reports blocked.
2. Maria Hill requests additional reconnaissance from Daisy Johnson.
3. Maria Hill consults Nick Fury if architecture is involved.
4. Maria Hill reprioritizes or reassigns work.
5. Melinda May resumes implementation.

6. **Nick Fury readiness review**
   - decide whether the implementation is acceptable
   - mark ready for Leo Fitz technical review or request changes

7. **Human review gates**
   - Leo Fitz represents required technical peer review
   - Jemma Simmons represents product or domain feedback when relevant
   - hold merge readiness until the required technical review is satisfied

## Standard checks

Maria Hill should prefer scripts or repeatable commands for:

- current branch and worktree status
- failing test or target command status
- Nx project/target checks relevant to the bug
- open GitHub review state if the work is already in PR flow
- Jira, Fitz, or Simmons review status when relevant

## Outputs

Debugger Mode should end with:

- clear symptom summary
- evidence and likely cause
- approved small fix plan
- focused implementation summary
- focused validation results
- Fitz/Simmons review status if merge readiness matters

## Token-efficiency rule

Use:

- **Maria Hill** for repetitive checks, routing, and command output
- **Daisy Johnson** for investigation and hypothesis quality
- **Nick Fury** for judgment
- **Melinda May** only after a plan is approved

Do not spend expensive model time on cheap operational checks if Maria Hill can do them first.
