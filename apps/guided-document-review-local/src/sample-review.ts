import type { ReviewCheckpoint } from "@shield/guided-document-review";

export const sampleDocument = `# Mission Rail V1

## The problem

Agents can move quickly, but repeated hand-composed packets, stale worktrees, and redundant approvals can stop routine delivery. The rail gives every participant one clear next action and reserves stops for meaningful human decisions.

## Architecture

The new system uses small libraries with one responsibility: canonical contracts, the pure mission rail, Guided Review, deterministic storage, lane lifecycle, projection, host effects, and a thin CLI.

## Epic Wheels Up

Track-Layer construction receives one bounded program-level GO. The accepted issue graph, owned paths, milestones, effects, budget, and exclusions are frozen once. Teams may cycle through those issues and bounded corrections without asking for a new PIN per issue.

## Guided Review and QA

Plan, code, and QA reviews are presented as small acceptance-criterion-aligned checkpoints. Guided QA must launch the exact candidate and retain visible expected-versus-observed proof. A checklist or passing unit test alone is not QA proof.

## First proving flight

A cold Hill begins one curated issue, follows one deterministic next action, reaches only meaningful human decisions, produces a draft pull request, visibly demonstrates the result, and returns the stable lane to ready.
`;

export const sampleCheckpoints: readonly ReviewCheckpoint[] = [
  {
    checkpointId: "problem",
    title: "Why build a rail?",
    sourceSearch: "Agents can move quickly",
    teaching: "The rail is not another approval system. It removes repeated judgment from routine delivery and makes the next move explicit.",
    question: "What recurring problem is the rail designed to remove, and what should still stop the team?",
    whyItMatters: "If this distinction is unclear, the product can drift back into bureaucracy.",
  },
  {
    checkpointId: "boundaries",
    title: "Small architecture boundaries",
    sourceSearch: "small libraries",
    teaching: "Each library owns one vocabulary and one reason to change. Effects stay outside the pure rail.",
    question: "Why will these package boundaries make the system easier for humans and agents to maintain?",
    whyItMatters: "The repository itself must demonstrate how the team builds software.",
  },
  {
    checkpointId: "epic-wheels-up",
    title: "Epic Wheels Up",
    sourceSearch: "one bounded program-level GO",
    teaching: "One bounded decision starts the whole Track-Layer program. Issue boundaries do not become repeated permission gates.",
    question: "What is authorized once, and what kinds of changes still require a new decision?",
    whyItMatters: "This is the mechanism that lets the team move without handholding.",
  },
  {
    checkpointId: "visible-qa",
    title: "Proof people can see",
    sourceSearch: "must launch the exact candidate",
    teaching: "Tests prove contracts. Guided QA demonstrates the actual experience and records what the operator observed.",
    question: "What evidence would convince you the feature actually works, beyond a green test suite?",
    whyItMatters: "A credible demo needs visible behavior, not an assertion that validation passed.",
  },
  {
    checkpointId: "flight",
    title: "The finish line",
    sourceSearch: "A cold Hill begins",
    teaching: "The first flight proves the entire path and returns the lane to a reusable state.",
    question: "Describe the first proving flight from cold intake to its observable finish.",
    whyItMatters: "A happy path is real only when a fresh team can complete it end to end.",
  },
];
