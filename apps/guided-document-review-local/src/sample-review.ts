import type { ReviewCheckpoint } from "@shield/guided-document-review";

export const sampleDocument = `# Mission Rail V2

## The problem

Agents can move quickly, but repeated hand-composed packets, stale worktrees, and redundant approvals can stop routine delivery. The rail gives every participant one clear next action and reserves stops for meaningful human decisions.

## Architecture

The new system uses small libraries with one responsibility: canonical contracts, the pure mission rail, Guided Review, deterministic storage, lane lifecycle, projection, host effects, and a thin CLI. Effects stay outside the pure rail so the meaning of mission state remains portable and testable.

## Guided Review and QA

Plan, code, and QA reviews are presented as small acceptance-criterion-aligned checkpoints. Guided QA must launch the exact candidate and retain visible expected-versus-observed proof. A checklist or passing unit test alone is not QA proof.

## First proving flight

A cold Hill begins one curated issue, follows one deterministic next action, reaches only meaningful human decisions, produces a draft pull request, visibly demonstrates the result, and returns the stable lane to ready.`;

export const sampleCheckpoints: readonly ReviewCheckpoint[] = [
  {
    checkpointId: "problem",
    title: "The problem and the promised outcome",
    learningSteps: [
      {
        stepId: "problem-pain",
        sourceQuote: "Agents can move quickly",
        purpose: "Separate delivery speed from the friction that blocks it.",
        question: "What recurring delivery failures can still stop a fast-moving team?",
        explanation: "A team may move fast and still lose time to repeated packets, stale worktrees, and unnecessary approvals.",
        whyItMatters: "Naming the real friction keeps the replacement focused on useful work.",
      },
      {
        stepId: "problem-outcome",
        sourceQuote: "one clear next action",
        purpose: "Identify the observable outcome the rail promises.",
        question: "What should every participant know after the rail determines the next move?",
        explanation: "The rail makes one next action clear while reserving stops for meaningful human decisions.",
        whyItMatters: "A visible outcome is easier to test than a promise to improve process.",
      },
    ],
  },
  {
    checkpointId: "boundaries",
    title: "Small architecture boundaries",
    learningSteps: [
      {
        stepId: "boundaries-library",
        sourceQuote: "small libraries with one responsibility",
        purpose: "Notice why each package owns a narrow boundary.",
        question: "How does one responsibility per library reduce maintenance risk?",
        explanation: "A small library has a clearer vocabulary and fewer reasons to change.",
        whyItMatters: "The architecture should make safe change easier for both people and agents.",
      },
      {
        stepId: "boundaries-effects",
        sourceQuote: "Effects stay outside the pure rail",
        purpose: "Distinguish state meaning from host effects.",
        question: "Why should effects remain outside the pure rail?",
        explanation: "Keeping effects outside means filesystem or host behavior cannot silently change what mission state means.",
        whyItMatters: "Pure rules are portable, testable, and easier to explain.",
      },
    ],
  },
  {
    checkpointId: "guided-review",
    title: "Guided Review as the human steering surface",
    learningSteps: [
      {
        stepId: "guided-checkpoints",
        sourceQuote: "small acceptance-criterion-aligned checkpoints",
        purpose: "See how a long review becomes a sequence of understandable decisions.",
        question: "What makes a checkpoint useful instead of just another checklist item?",
        explanation: "A useful checkpoint teaches one idea, asks the reader to explain it, and connects it to a criterion.",
        whyItMatters: "Small decisions help people steer without reading an entire agent transcript.",
      },
      {
        stepId: "guided-proof",
        sourceQuote: "visible expected-versus-observed proof",
        purpose: "Separate visible QA proof from a green test result.",
        question: "What should a reviewer be able to see during guided QA?",
        explanation: "Guided QA launches the exact candidate and preserves what was expected alongside what was observed.",
        whyItMatters: "People can trust a result more when the actual experience is visible.",
      },
    ],
  },
  {
    checkpointId: "first-flight",
    title: "The first proving flight",
    learningSteps: [
      {
        stepId: "flight-cold-start",
        sourceQuote: "A cold Hill begins one curated issue",
        purpose: "Trace the proving flight from a fresh start.",
        question: "What must a cold Hill be able to begin without hidden preparation?",
        explanation: "The first flight starts with one bounded issue and follows the deterministic rail from intake onward.",
        whyItMatters: "A fresh start reveals whether the workflow is genuinely repeatable.",
      },
      {
        stepId: "flight-finish",
        sourceQuote: "returns the stable lane to ready",
        purpose: "Identify the reusable finish condition.",
        question: "What observable state proves the first flight finished cleanly?",
        explanation: "The work is demonstrated, a draft pull request exists, and the stable lane is ready for reuse.",
        whyItMatters: "Finishing in a reusable state prevents successful work from becoming stranded.",
      },
    ],
  },
];
