# Debugger Mode

First module in the sortie system.

Use this mode for:

- failing tests
- runtime bugs
- flaky behavior
- confusing application behavior
- build or type errors
- bug reports where the right fix is not yet clear

## Lead seat

**Jester (Debugger/Recon)** leads the reasoning flow.  
**Stinger (Orchestrator)** handles cheap operations, validation commands, and external coordination.

## Flow

1. **Stinger intake**
   - classify the bug
   - collect cheap context
   - identify likely systems involved
   - run cheap status/validation commands when helpful
   - use the Repository Context Discovery playbook when repo shape, test stack, or validation commands are still unclear

2. **Jester investigation**
   - inspect relevant files, tests, and evidence
   - identify likely root cause
   - separate facts from assumptions
   - propose the smallest plausible fix plan

3. **Viper review**
   - review evidence and plan
   - approve, revise, or send back for more investigation

4. **Iceman implementation**
   - implement only the approved plan
   - update focused tests when appropriate
   - report exact changes and recommended validation

5. **Stinger validation**
   - run the requested Nx lint/test/build/affected or focused checks
   - gather results
   - summarize for Viper and Maverick

6. **Viper readiness review**
   - decide whether the implementation is acceptable
   - mark ready for Goose review or request changes

7. **Goose review gate**
   - represent GitHub, Jira, Atlassian, direct comms, or required peer review
   - hold merge readiness until review is satisfied

## Standard checks

Stinger should prefer scripts or repeatable commands for:

- current branch and worktree status
- failing test or target command status
- Nx project/target checks relevant to the bug
- open GitHub review state if the work is already in PR flow
- Jira or Goose-side review status when relevant

## Outputs

Debugger Mode should end with:

- clear symptom summary
- evidence and likely cause
- approved small fix plan
- focused implementation summary
- focused validation results
- Goose review status if merge readiness matters

## Token-efficiency rule

Use:

- **Stinger** for repetitive checks, routing, and command output
- **Jester** for investigation and hypothesis quality
- **Viper** for judgment
- **Iceman** only after a plan is approved

Do not spend expensive model time on cheap operational checks if Stinger can do them first.
