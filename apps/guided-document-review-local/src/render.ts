import type {
  CheckpointSet,
  LearningStep,
  ReviewCheckpoint,
  ReviewDecision,
  ReviewSession,
  SourceDocument,
} from "@shield/guided-document-review";

import type { RevisionPromptChange } from "@shield/guided-document-review";
import {
  renderMarkdownSections,
  renderedMarkdownText,
  type CompletedSourceMarker,
  type SourceRevisionPreview,
} from "./markdown.js";

export interface ReviewView {
  readonly source: SourceDocument;
  readonly checkpointSet: CheckpointSet;
  readonly session: ReviewSession;
  readonly checkpoint: ReviewCheckpoint;
  readonly step: LearningStep;
  readonly excerpt: string;
  readonly message: string | null;
  readonly revisionEditorOpen: boolean;
}

export function renderJourney(
  container: HTMLElement,
  view: Pick<ReviewView, "checkpointSet" | "session">,
): void {
  container.replaceChildren();
  const renderedGroups = new Set<string>();
  const hasCompletedCheckpointAfterCurrent = view.checkpointSet.checkpoints
    .slice(view.session.currentCheckpointIndex + 1)
    .some(({ checkpointId }) => view.session.answers[checkpointId].decision !== null);
  const trailCompleted =
    view.session.phase === "complete" || hasCompletedCheckpointAfterCurrent;
  const canReopenCheckpoint = view.session.phase === "complete";
  view.checkpointSet.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.journeyGroup) {
      if (renderedGroups.has(checkpoint.journeyGroup.groupId)) return;
      renderedGroups.add(checkpoint.journeyGroup.groupId);
      const members = view.checkpointSet.checkpoints.filter(
        (candidate) => candidate.journeyGroup?.groupId === checkpoint.journeyGroup?.groupId,
      );
      const reviewed = members.filter((member) => view.session.answers[member.checkpointId].decision !== null).length;
      const activeMemberIndex = members.findIndex(
        (member) => member.checkpointId === view.checkpointSet.checkpoints[view.session.currentCheckpointIndex]?.checkpointId,
      );
      const complete = trailCompleted || reviewed === members.length;
      const active = !complete && activeMemberIndex >= 0;
      const state = complete ? "complete" : active ? "active" : "waiting";
      const item = element("li", `trail-stop trail-stop--${state} trail-stop--group`);
      const content = journeyStopButton(checkpoint.checkpointId, complete && canReopenCheckpoint, [
        element("span", "trail-stop__marker", complete ? "✓" : active ? "•" : "○"),
        element("span", "trail-stop__title", checkpoint.journeyGroup.title),
        element("span", "trail-stop__decision", active
          ? `Principle ${activeMemberIndex + 1} of ${members.length}`
          : `${reviewed}/${members.length} reviewed`),
      ]);
      item.append(content);
      container.append(item);
      return;
    }
    const answer = view.session.answers[checkpoint.checkpointId];
    const complete = trailCompleted || index < view.session.currentCheckpointIndex;
    const active = !complete && index === view.session.currentCheckpointIndex;
    const state = complete ? "complete" : active ? "active" : "waiting";
    const item = element("li", `trail-stop trail-stop--${state}`);
    const content = journeyStopButton(checkpoint.checkpointId, complete && canReopenCheckpoint, [
      element("span", "trail-stop__marker", complete ? "✓" : active ? "•" : "○"),
      element("span", "trail-stop__title", checkpoint.title),
    ]);
    if (answer.decision) content.append(element("span", "trail-stop__decision", labelDecision(answer.decision)));
    item.append(content);
    container.append(item);
  });
}

function journeyStopButton(checkpointId: string, enabled: boolean, children: readonly HTMLElement[]): HTMLElement {
  if (!enabled) {
    const content = element("span", "trail-stop__content");
    content.append(...children);
    return content;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trail-stop__link";
  button.dataset.action = "jump-checkpoint";
  button.dataset.checkpointId = checkpointId;
  button.title = "Reopen this completed checkpoint";
  button.append(...children);
  return button;
}

export function renderCheckpoint(container: HTMLElement, view: ReviewView, speechSupported: boolean): void {
  container.replaceChildren();
  const quickReview = view.checkpoint.reviewMode === "disposition";
  const principleCheckpoints = view.checkpointSet.checkpoints.filter(({ reviewMode }) => reviewMode === "disposition");
  const principleIndex = principleCheckpoints.findIndex(({ checkpointId }) => checkpointId === view.checkpoint.checkpointId);
  const header = element("header", "checkpoint-header");
  header.append(
    element("p", "eyebrow", quickReview ? "Quick principle review" : phaseTitle(view.session.phase)),
    element("h2", "checkpoint-title", view.checkpoint.title),
    element("p", "checkpoint-count", quickReview
      ? `Principle ${principleIndex + 1} of ${principleCheckpoints.length}`
      : `Checkpoint ${view.session.currentCheckpointIndex + 1} of ${view.checkpointSet.checkpoints.length}`),
  );
  if (speechSupported || view.session.phase !== "orient") {
    container.append(checkpointToolbar(speechSupported, view.session.phase !== "orient"));
  }
  container.append(header);
  if (view.message) container.append(element("p", "message message--warning", view.message));
  if (view.session.phase === "orient") renderOrient(container, view);
  if (view.session.phase === "learn") renderLearn(container, view);
  if (view.session.phase === "explain_back") renderExplain(container, view);
  if (view.session.phase === "decide") renderDecision(container, view);
}

function renderQuickDisposition(container: HTMLElement, view: ReviewView): void {
  container.append(
    card("Purpose", view.step.purpose),
    element("p", "eyebrow", "Question"),
    element("p", "learning-question learning-question--static", view.step.question),
    learningReveal(view.step.explanation, view.step.whyItMatters),
  );
  if (view.step.priorReview) container.append(priorReviewCard(view.step.priorReview));
  container.append(quickDispositionToolbar());
}

function quickDispositionToolbar(): HTMLElement {
  const toolbar = element("div", "decision-toolbar");
  toolbar.append(
    actionButton("✓ PASS", "quick-pass", "success"),
    actionButton("✎ Revise", "quick-revise", "secondary"),
  );
  return toolbar;
}

export function renderSource(
  container: HTMLElement,
  source: SourceDocument,
  excerpt: string,
  checkpointId: string,
  stepId: string,
  sourceQuote: string,
  speechSupported: boolean,
  completedMarkers: readonly CompletedSourceMarker[] = [],
  revisionPreview?: SourceRevisionPreview,
): void {
  const renderedPassage = renderedMarkdownText(sourceQuote);
  const actions = reviewToolbar();
  actions.append(actionButton("Copy passage", "copy-source", "secondary"));
  if (speechSupported) {
    actions.append(actionButton("▶ Read", "read-source", "secondary"));
    actions.append(actionButton("■ Stop", "stop-reading", "quiet"));
  }
  container.replaceChildren(
    actions,
    element("p", "eyebrow", "Source document"),
    element("h2", "source-title", source.title),
    element("p", "source-quote-label", renderedPassage ? `Exact passage: “${renderedPassage}”` : "Exact passage: unresolved"),
    renderMarkdownSections(excerpt, checkpointId, stepId, sourceQuote, completedMarkers, revisionPreview),
  );
}

export function renderStats(container: HTMLElement, session: ReviewSession, checkpointSet: CheckpointSet): void {
  const stops = new Map<string, readonly ReviewCheckpoint[]>();
  checkpointSet.checkpoints.forEach((checkpoint) => {
    const key = checkpoint.journeyGroup ? `group:${checkpoint.journeyGroup.groupId}` : `checkpoint:${checkpoint.checkpointId}`;
    stops.set(key, [...(stops.get(key) ?? []), checkpoint]);
  });
  const completed = [...stops.values()].filter((members) =>
    members.every(({ checkpointId }) => session.answers[checkpointId].decision !== null),
  ).length;
  const revealed = Object.values(session.answers).reduce((sum, answer) => sum + answer.revealedStepIds.length, 0);
  container.replaceChildren(
    stat("Trail", `${completed}/${stops.size}`),
    stat("Reveals", String(revealed)),
    stat("Explained", `${Object.values(session.answers).filter((answer) => answer.explanation !== null).length}`),
  );
}

export function renderCompletion(
  container: HTMLElement,
  changes: readonly RevisionPromptChange[],
  confirmed: boolean,
  message: string | null,
): void {
  container.replaceChildren(
    element("p", "completion-burst", "✦ TRAIL COMPLETE ✦"),
    element("h2", "completion-title", "Changes-only review"),
    element("p", "completion-epilogue", "Document complete. You have died of dysentery."),
    element("p", "completion-copy", changes.length
      ? "Review the requested replacements in checkpoint order. Confirmation is educational/document approval only; it is not authority to implement, publish, merge, or release."
      : "No replacement requests were recorded. The original document remains unchanged, and there is no revision packet to confirm or apply."),
  );
  if (message) container.append(element("p", "message message--success", message));
  if (changes.length) {
    const list = element("ol", "completion-list");
    changes.forEach((change) => {
      const item = element("li", "completion-change-card");
      item.append(
        element("h3", "completion-change-title", `${change.checkpointTitle} · ${change.replacement.stepId}`),
        element("p", "completion-original", `Original (locked): ${change.replacement.original}`),
        element("p", "completion-replacement", `Desired replacement: ${change.replacement.replacement}`),
      );
      if (change.replacement.rationale) item.append(element("p", "completion-rationale", `Rationale: ${change.replacement.rationale}`));
      list.append(item);
    });
    container.append(
      list,
      element("p", "fine-print", confirmed
        ? "Confirmed as educational/document approval only. No implementation authority is created."
        : "Read the packet above before confirming the educational/document approval."),
    );
  }
}

function renderOrient(container: HTMLElement, view: ReviewView): void {
  container.append(
    card("Why this checkpoint matters", view.step.whyItMatters),
    actionButton("Begin this checkpoint", "advance", "primary"),
  );
}

function renderLearn(container: HTMLElement, view: ReviewView): void {
  container.append(
    element("p", "step-count", `Learning step ${view.session.currentStepIndex + 1} of ${view.checkpoint.learningSteps.length}`),
    card("Purpose", view.step.purpose),
    element("p", "eyebrow", "Question"),
    element("p", "learning-question learning-question--static", view.step.question),
    learningReveal(view.step.explanation, view.step.whyItMatters),
  );
  if (view.step.priorReview) container.append(priorReviewCard(view.step.priorReview));
  renderStepDispositionControls(container, view);
}

function priorReviewCard(prior: NonNullable<LearningStep["priorReview"]>): HTMLElement {
  const section = element("section", `prior-review prior-review--${prior.disposition}`);
  section.append(
    element("p", "eyebrow", `Recovered earlier answer · ${prior.disposition === "pass" ? "NN / PASS" : "REVISE"}`),
    element("p", "learning-card__copy", prior.note),
  );
  if (prior.replacement) section.append(element("p", "prior-review__replacement", `Prepared revision: ${prior.replacement}`));
  return section;
}

function learningReveal(explanation: string, whyItMatters: string): HTMLElement {
  const section = element("section", "learning-card learning-reveal");
  section.append(
    element("p", "eyebrow", "Explanation"),
    element("p", "learning-card__copy", explanation),
    element("p", "eyebrow learning-reveal__why-label", "Why it matters"),
    element("p", "learning-card__copy", whyItMatters),
  );
  return section;
}

function renderExplain(container: HTMLElement, view: ReviewView): void {
  container.append(learningRecap(view.checkpoint));
  container.append(element("p", "prompt", "How do these ideas work together, and what should someone understand or challenge after reading this checkpoint?"));
  const label = element("label", "field-label", "Explain the checkpoint in your own words");
  label.htmlFor = "explanation";
  const textarea = document.createElement("textarea");
  textarea.id = "explanation";
  textarea.rows = 7;
  textarea.placeholder = "What does this mean, why does it matter, and what would you challenge?";
  textarea.value = view.session.answers[view.checkpoint.checkpointId].explanation ?? "";
  container.append(
    label,
    textarea,
    draftStatus(),
  );
  container.append(actionButton("Save reflection and continue", "save-explanation", "primary"));
  textarea.focus();
}

function renderStepDispositionControls(container: HTMLElement, view: ReviewView): void {
  const toolbar = element("div", "decision-toolbar");
  const pass = actionButton("✓ Looks right / PASS", "step-disposition", "success");
  pass.dataset.value = "pass";
  const revise = actionButton(view.revisionEditorOpen ? "Close revision" : "✎ Revise", view.revisionEditorOpen ? "hide-revision" : "show-revision", "secondary");
  toolbar.append(pass, revise);
  container.append(toolbar);
  if (!view.revisionEditorOpen) {
    container.append(element("p", "fine-print", "PASS records this exact learning passage as correct for this review."));
    return;
  }
  const saved = view.session.answers[view.checkpoint.checkpointId].stepDispositions.find(({ stepId }) => stepId === view.step.stepId);
  const original = element("p", "replacement-original", `Original passage (locked): ${view.step.sourceQuote}`);
  original.id = "replacement-original";
  const replacementLabel = element("label", "field-label", "Desired replacement for this passage");
  replacementLabel.htmlFor = "replacement-text";
  const replacementText = document.createElement("textarea");
  replacementText.id = "replacement-text";
  replacementText.rows = 4;
  replacementText.placeholder = "Write the complete replacement text for the locked passage.";
  replacementText.value = saved?.replacement?.replacement ?? view.step.priorReview?.replacement ?? "";
  replacementLabel.append(replacementText);
  const rationaleLabel = element("label", "field-label", "Optional rationale");
  rationaleLabel.htmlFor = "replacement-rationale";
  const rationale = document.createElement("textarea");
  rationale.id = "replacement-rationale";
  rationale.rows = 3;
  rationale.placeholder = "Why would this replacement help?";
  rationale.value = saved?.replacement?.rationale ?? (view.step.priorReview?.disposition === "revise" ? view.step.priorReview.note : "");
  rationaleLabel.append(rationale);
  const save = actionButton("Save Revise disposition", "step-disposition", "primary");
  save.dataset.value = "revise";
  container.append(original, replacementLabel, rationaleLabel, draftStatus(), save);
}

function learningRecap(checkpoint: ReviewCheckpoint): HTMLElement {
  const recap = element("section", "learning-recap");
  recap.append(element("p", "eyebrow", "Learning recap"));
  checkpoint.learningSteps.forEach((step, index) => {
    const item = element("article", "learning-recap__card");
    item.append(
      element("h3", "learning-recap__question", `${index + 1}. ${step.question}`),
      element("p", "learning-recap__answer", `${step.explanation} ${step.whyItMatters}`),
    );
    recap.append(item);
  });
  return recap;
}

function renderDecision(container: HTMLElement, view: ReviewView): void {
  renderDecisionControls(container, view, "decision");
}

function renderDecisionControls(container: HTMLElement, view: ReviewView, decisionAction: string): void {
  container.append(element("p", "prompt", view.checkpoint.reviewMode === "disposition"
    ? "Does this principle pass, or does the document need a revision?"
    : "What should happen with this checkpoint?"));
  if (view.step.priorReview) container.append(priorReviewCard(view.step.priorReview));
  const toolbar = element("div", "decision-toolbar");
  const approve = actionButton(view.checkpoint.reviewMode === "disposition" ? "✓ PASS" : "✓ Looks right", decisionAction, "success");
  approve.dataset.value = "approve";
  toolbar.append(
    approve,
    actionButton(view.revisionEditorOpen ? "Close revision" : "✎ Revise", view.revisionEditorOpen ? "hide-revision" : "show-revision", "secondary"),
  );
  container.append(toolbar);
  if (!view.revisionEditorOpen) {
    container.append(element("p", "fine-print", "“Looks right” is educational/document approval only. It does not authorize implementation, publication, merge, or release."));
    return;
  }

  const replacement = view.session.answers[view.checkpoint.checkpointId].replacement;
  const priorReview = view.step.priorReview;
  const stepSelect = document.createElement("select");
  stepSelect.id = "replacement-step";
  view.checkpoint.learningSteps.forEach((step) => {
    const option = document.createElement("option");
    option.value = step.stepId;
    option.textContent = `${view.checkpoint.learningSteps.indexOf(step) + 1}. ${step.purpose}`;
    option.selected = step.stepId === (replacement?.stepId ?? view.step.stepId);
    stepSelect.append(option);
  });
  const stepLabel = element("label", "field-label", "Replacement step (only for revision)");
  stepLabel.htmlFor = stepSelect.id;
  stepLabel.append(stepSelect);
  const original = element("p", "replacement-original", `Original passage (locked): ${replacement?.original ?? view.step.sourceQuote}`);
  original.id = "replacement-original";
  const replacementLabel = element("label", "field-label", "Desired replacement");
  replacementLabel.htmlFor = "replacement-text";
  const replacementText = document.createElement("textarea");
  replacementText.id = "replacement-text";
  replacementText.rows = 4;
  replacementText.placeholder = "Write the complete replacement text for the locked passage.";
  replacementText.value = replacement?.replacement ?? priorReview?.replacement ?? "";
  replacementLabel.append(replacementText);
  const rationaleLabel = element("label", "field-label", "Optional rationale");
  rationaleLabel.htmlFor = "replacement-rationale";
  const rationale = document.createElement("textarea");
  rationale.id = "replacement-rationale";
  rationale.rows = 3;
  rationale.placeholder = "Why would this replacement help?";
  rationale.value = replacement?.rationale ?? (priorReview?.disposition === "revise" ? priorReview.note : "");
  rationaleLabel.append(rationale);
  container.append(
    element("p", "hint", "Choose Revise only when the complete desired replacement is ready."),
    ...(view.checkpoint.learningSteps.length > 1 ? [stepLabel] : [hiddenStepInput(view.step.stepId)]),
    original,
    replacementLabel,
    rationaleLabel,
    draftStatus(),
  );
  const save = actionButton("Save revision", decisionAction, "primary");
  save.dataset.value = "revise";
  container.append(save, element("p", "fine-print", "The requested change is recorded for the changes-only review at the end of the trail."));
}

function hiddenStepInput(stepId: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "hidden";
  input.id = "replacement-step";
  input.value = stepId;
  return input;
}

function actionButton(label: string, action: string, style: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button--${style}`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function checkpointToolbar(speechSupported: boolean, showBack: boolean): HTMLElement {
  const actions = reviewToolbar();
  if (showBack) actions.append(actionButton("← Back", "back", "quiet"));
  if (speechSupported) {
    actions.append(actionButton("▶ Read", "read-checkpoint", "secondary"), actionButton("■ Stop", "stop-reading", "quiet"));
  }
  return actions;
}

function reviewToolbar(): HTMLElement {
  return element("div", "review-toolbar");
}

function card(label: string, body: string): HTMLElement {
  const section = element("section", "learning-card");
  section.append(element("p", "eyebrow", label), element("p", "learning-card__copy", body));
  return section;
}

function draftStatus(): HTMLElement {
  const status = element("p", "hint draft-status", "Drafts save locally as you type.");
  status.id = "draft-status";
  status.setAttribute("role", "status");
  return status;
}

function stat(label: string, value: string): HTMLElement {
  const item = element("div", "stat");
  item.append(element("span", "stat__value", value), element("span", "stat__label", label));
  return item;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function phaseTitle(phase: ReviewSession["phase"]): string {
  return ({ orient: "Scout the checkpoint", learn: "Learn one step", explain_back: "Prove it to yourself", decide: "Choose the trail" } as Record<string, string>)[phase] ?? "Complete";
}

function labelDecision(decision: ReviewDecision): string {
  return ({ understand: "Understood", question: "Question", revise: "Needs revision", approve: "Looks right" })[decision];
}
