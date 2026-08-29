import type {
  CheckpointSet,
  ReviewCheckpoint,
  ReviewDecision,
  ReviewSession,
  SourceDocument,
} from "@shield/guided-document-review";

export interface ReviewView {
  readonly source: SourceDocument;
  readonly checkpointSet: CheckpointSet;
  readonly session: ReviewSession;
  readonly checkpoint: ReviewCheckpoint;
  readonly excerpt: string;
  readonly message: string | null;
}

export function renderJourney(
  container: HTMLElement,
  view: Pick<ReviewView, "checkpointSet" | "session">,
): void {
  container.replaceChildren();
  view.checkpointSet.checkpoints.forEach((checkpoint, index) => {
    const answer = view.session.answers[checkpoint.checkpointId];
    const state = index < view.session.currentCheckpointIndex ? "complete" :
      index === view.session.currentCheckpointIndex ? "active" : "waiting";
    const item = element("li", `trail-stop trail-stop--${state}`);
    item.append(
      element("span", "trail-stop__marker", state === "complete" ? "✓" : String(index + 1)),
      element("span", "trail-stop__title", checkpoint.title),
    );
    if (answer.decision) item.append(element("span", "trail-stop__decision", labelDecision(answer.decision)));
    container.append(item);
  });
}

export function renderCheckpoint(container: HTMLElement, view: ReviewView, speechSupported: boolean): void {
  container.replaceChildren();
  const header = element("header", "checkpoint-header");
  header.append(
    element("p", "eyebrow", phaseTitle(view.session.phase)),
    element("h2", "checkpoint-title", view.checkpoint.title),
    element("p", "checkpoint-count", `Checkpoint ${view.session.currentCheckpointIndex + 1} of ${view.checkpointSet.checkpoints.length}`),
  );
  container.append(header);

  if (speechSupported) container.append(speechActions("Read checkpoint aloud", "read-checkpoint"));

  if (view.message) container.append(element("p", "message message--warning", view.message));
  if (view.session.phase === "orient") renderOrient(container, view);
  if (view.session.phase === "teach") renderTeach(container, view);
  if (view.session.phase === "ask") renderExplain(container, view);
  if (view.session.phase === "explain_back") renderExplain(container, view);
  if (view.session.phase === "confidence") renderConfidence(container, view);
  if (view.session.phase === "decide") renderDecision(container, view);
  if (view.session.phase !== "orient") container.append(actionButton("← Back", "back", "quiet"));
}

export function renderSource(
  container: HTMLElement,
  source: SourceDocument,
  excerpt: string,
  speechSupported: boolean,
): void {
  container.replaceChildren(
    element("p", "eyebrow", "Source document"),
    element("h2", "source-title", source.title),
    element("pre", "source-excerpt", excerpt),
  );
  if (speechSupported) container.append(speechActions("Read excerpt aloud", "read-source"));
}

export function renderStats(container: HTMLElement, session: ReviewSession, total: number): void {
  const completed = Object.values(session.answers).filter((answer) => answer.decision).length;
  const confident = Object.values(session.answers).filter((answer) => (answer.confidence ?? 0) >= 4).length;
  container.replaceChildren(
    stat("Trail", `${completed}/${total}`),
    stat("Momentum", completed ? `${completed} day${completed === 1 ? "" : "s"}` : "Ready"),
    stat("Clarity", `${confident} strong`),
  );
}

export function renderCompletion(container: HTMLElement, session: ReviewSession): void {
  container.replaceChildren(
    element("p", "completion-burst", "✦ TRAIL COMPLETE ✦"),
    element("h2", "completion-title", "You made it to the trailhead."),
    element("p", "completion-copy", "You did not merely approve a document. You explained its decisions, recorded your confidence, and left a reusable learning artifact."),
  );
  const list = element("ul", "completion-list");
  Object.values(session.answers).forEach((answer) => {
    const item = element("li", "", `${answer.checkpointId}: ${labelDecision(answer.decision ?? "question")}`);
    if (answer.requestedChange) {
      item.append(element("p", "completion-change", `Requested change: ${answer.requestedChange}`));
    }
    list.append(item);
  });
  container.append(list);
}

function renderOrient(container: HTMLElement, view: ReviewView): void {
  container.append(
    card("Your destination", view.checkpoint.whyItMatters),
    actionButton("Begin this checkpoint", "advance", "primary"),
  );
}

function renderTeach(container: HTMLElement, view: ReviewView): void {
  container.append(
    card("Trail guide", view.checkpoint.teaching),
    actionButton("Show me what to look for", "advance", "primary"),
  );
}

function renderExplain(container: HTMLElement, view: ReviewView): void {
  container.append(card("Checkpoint question", view.checkpoint.question));
  const label = element("label", "field-label", "Explain it in your own words");
  label.htmlFor = "explanation";
  const textarea = document.createElement("textarea");
  textarea.id = "explanation";
  textarea.rows = 7;
  textarea.placeholder = "What does this mean, why does it matter, and what would you challenge?";
  textarea.value = view.session.answers[view.checkpoint.checkpointId].explanation ?? "";
  container.append(label, textarea, actionButton("Lock in my explanation", "save-explanation", "primary"));
  textarea.focus();
}

function renderConfidence(container: HTMLElement, view: ReviewView): void {
  container.append(element("p", "prompt", "How confidently could you explain this to someone else?"));
  const group = element("div", "confidence-grid");
  [1, 2, 3, 4, 5].forEach((level) => {
    const button = actionButton(String(level), "confidence", level >= 4 ? "success" : "secondary");
    button.dataset.value = String(level);
    button.setAttribute("aria-label", `Confidence ${level} of 5`);
    group.append(button);
  });
  container.append(group, element("p", "hint", "1 = I need another pass · 5 = I could teach it"));
}

function renderDecision(container: HTMLElement, view: ReviewView): void {
  container.append(element("p", "prompt", "What is your disposition on this checkpoint?"));
  const changeLabel = element("label", "field-label", "Requested change");
  changeLabel.htmlFor = "requested-change";
  const requestedChange = document.createElement("textarea");
  requestedChange.id = "requested-change";
  requestedChange.rows = 4;
  requestedChange.placeholder = "Required for Needs revision: describe exactly what should change and why.";
  requestedChange.value = view.session.answers[view.checkpoint.checkpointId].requestedChange ?? "";
  container.append(changeLabel, requestedChange);
  const group = element("div", "decision-grid");
  const decisions: readonly [ReviewDecision, string][] = [
    ["understand", "I understand"],
    ["question", "I have a question"],
    ["revise", "Needs revision"],
    ["approve", "Looks right to me"],
  ];
  decisions.forEach(([value, label]) => {
    const button = actionButton(label, "decision", value === "approve" || value === "understand" ? "success" : "secondary");
    button.dataset.value = value;
    group.append(button);
  });
  container.append(group, element("p", "fine-print", "“Looks right” is an educational disposition only. It does not approve or merge anything."));
}

function actionButton(label: string, action: string, style: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button--${style}`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function speechActions(label: string, action: string): HTMLElement {
  const actions = element("div", "speech-actions");
  actions.append(actionButton(`▶ ${label}`, action, "secondary"));
  actions.append(actionButton("■ Stop", "stop-reading", "quiet"));
  return actions;
}

function card(label: string, body: string): HTMLElement {
  const section = element("section", "learning-card");
  section.append(element("p", "eyebrow", label), element("p", "learning-card__copy", body));
  return section;
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
  return ({ orient: "Scout the checkpoint", teach: "Learn the terrain", ask: "Prove it to yourself", explain_back: "Prove it to yourself", confidence: "Check your supplies", decide: "Choose the trail" } as Record<string, string>)[phase] ?? "Complete";
}

function labelDecision(decision: ReviewDecision): string {
  return ({ understand: "Understood", question: "Question", revise: "Revise", approve: "Looks right" })[decision];
}
