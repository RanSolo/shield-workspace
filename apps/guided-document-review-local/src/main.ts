import {
  advancePhase,
  applyConfirmedReplacements,
  checkpointsFromHeadings,
  collectReplacementRequests,
  createCheckpointSet,
  createCheckpointPrompt,
  createRevisionPrompt,
  createReviewArtifact,
  createSourceDocument,
  decodeReviewSession,
  findSourceExcerpt,
  recordConfidence,
  recordDecision,
  recordExplanation,
  recordStepReveal,
  returnToPreviousPhase,
  startReviewSession,
  type CheckpointSet,
  type ExpectedTransition,
  type LearningStep,
  type ReviewCheckpoint,
  type ReviewDecision,
  type ReviewPhase,
  type ReviewSession,
  type SourceDocument,
} from "@shield/guided-document-review";

import { renderCheckpoint, renderCompletion, renderJourney, renderSource, renderStats } from "./render.js";
import { sampleCheckpoints, sampleDocument } from "./sample-review.js";
import { createSpeechControls } from "./speech.js";

interface AppState {
  source: SourceDocument;
  checkpointSet: CheckpointSet;
  session: ReviewSession;
  message: string | null;
}

const storagePrefix = "document-trail:v2:";
let state: AppState | null = null;
let revisionPacketConfirmed = false;

const setupPanel = required("setup-panel");
const reviewPanel = required("review-panel");
const journey = required("journey");
const checkpointPanel = required("checkpoint-panel");
const sourcePanel = required("source-panel");
const stats = required("stats");
const completionPanel = required("completion-panel");
const speechStatus = required("speech-status");
const trailProgress = required("trail-progress");
const speech = createSpeechControls();
const sourceHeightObserver = new ResizeObserver(() => syncReviewViewport());
sourceHeightObserver.observe(checkpointPanel);
window.addEventListener("resize", () => syncReviewViewport());

document.addEventListener("click", (event) => void handleClick(event));
document.addEventListener("change", (event) => updateReplacementOriginal(event));
required("start-sample").addEventListener("click", () => void startSample());
required("start-custom").addEventListener("click", () => void startCustom());
required("copy-ai-prompt").addEventListener("click", () => void copyAiPrompt());
required("document-file").addEventListener("change", (event) => void loadTextFile(event, "document-text"));
required("checkpoint-file").addEventListener("change", (event) => void loadTextFile(event, "checkpoint-json"));

async function startSample(): Promise<void> {
  await beginReview("Mission Rail V2", sampleDocument, sampleCheckpoints, reviewerName());
}

async function startCustom(): Promise<void> {
  const title = valueOf("document-title").trim();
  const text = valueOf("document-text");
  const checkpointJson = valueOf("checkpoint-json").trim();
  try {
    const checkpoints = checkpointJson ? JSON.parse(checkpointJson) : checkpointsFromHeadings(text);
    await beginReview(title, text, checkpoints, reviewerName());
  } catch (error) {
    showSetupMessage(error instanceof Error ? error.message : "Unable to start this review.");
  }
}

async function copyAiPrompt(): Promise<void> {
  try {
    const prompt = createCheckpointPrompt(valueOf("document-title"), valueOf("document-text"));
    await navigator.clipboard.writeText(prompt);
    showSetupMessage("Prompt copied. Give it to any AI, then paste the returned V2 JSON below.");
  } catch (error) {
    showSetupMessage(error instanceof Error ? error.message : "Unable to copy the AI prompt.");
  }
}

async function beginReview(title: string, text: string, checkpoints: unknown, name: string): Promise<void> {
  const source = await createSourceDocument(title, text);
  const checkpointSet = await createCheckpointSet(`${title} learning trail`, checkpoints, text);
  const reviewer = name ? { kind: "self_asserted" as const, name } : { kind: "unattributed" as const, name: null };
  const saved = readDraft(source, checkpointSet);
  const session = saved ?? await startReviewSession(source, checkpointSet, reviewer, clock);
  state = { source, checkpointSet, session, message: saved ? "Your saved V2 trail was restored." : null };
  revisionPacketConfirmed = false;
  setupPanel.hidden = true;
  reviewPanel.hidden = false;
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

async function handleClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "restart") return restart();
  if (action === "download") return void downloadArtifact();
  if (action === "confirm-revision" && state?.session.phase === "complete") {
    revisionPacketConfirmed = true;
    state = { ...state, message: null };
    render();
    return;
  }
  if (action === "copy-revision-prompt") return void copyRevisionPrompt();
  if (action === "download-revised") return void downloadRevisedMarkdown();
  if (action === "stop-reading") return speech.stop(showSpeechStatus);
  if (action === "copy-source" && state && state.session.phase !== "complete") {
    try {
      await navigator.clipboard.writeText(activeStep().sourceQuote);
      button.textContent = "✓ Passage copied";
    } catch {
      button.textContent = "Copy failed — select the text";
    }
    return;
  }
  if (!state || state.session.phase === "complete") return;

  const checkpoint = activeCheckpoint();
  const step = activeStep();
  if (action === "read-checkpoint") {
    return speech.read(visibleCheckpointText(checkpoint, step, state.session.phase), showSpeechStatus);
  }
  if (action === "read-source") {
    return speech.read(findSourceExcerpt(state.source, step.sourceQuote), showSpeechStatus);
  }
  const expected = expectation(checkpoint.checkpointId, state.session.phase === "learn" ? step.stepId : undefined);
  let result;
  if (action === "advance") result = advancePhase(state.session, state.checkpointSet, expected, clock);
  if (action === "back") result = returnToPreviousPhase(state.session, state.checkpointSet, expected, clock);
  if (action === "reveal-step") result = recordStepReveal(state.session, state.checkpointSet, expected, clock);
  if (action === "save-explanation") {
    result = recordExplanation(state.session, state.checkpointSet, expected, valueOf("explanation"), clock);
  }
  if (action === "confidence") {
    result = recordConfidence(state.session, state.checkpointSet, expected, Number(button.dataset.value) as 1 | 2 | 3 | 4 | 5, clock);
  }
  if (action === "decision") {
    result = recordDecision(state.session, state.checkpointSet, expected, {
      decision: button.dataset.value as ReviewDecision,
      replacement: button.dataset.value === "revise" ? replacementInput() : undefined,
    }, clock);
  }
  if (!result) return;
  if (!result.ok) {
    state = { ...state, message: result.message };
  } else {
    state = { ...state, session: result.session, message: null };
    saveDraft();
  }
  render();
}

function render(): void {
  if (!state) return;
  renderTrailProgress();
  renderJourney(journey, state);
  renderStats(stats, state.session, state.checkpointSet.checkpoints.length);
  if (state.session.phase === "complete") {
    checkpointPanel.hidden = true;
    sourcePanel.hidden = true;
    completionPanel.hidden = false;
    const changes = collectReplacementRequests(state.checkpointSet, state.session);
    renderCompletion(completionPanel, changes, revisionPacketConfirmed, state.message);
    completionPanel.append(completionActions(changes.length > 0));
    return;
  }
  const checkpoint = activeCheckpoint();
  const step = activeStep();
  const excerpt = findSourceExcerpt(state.source, step.sourceQuote);
  checkpointPanel.hidden = false;
  sourcePanel.hidden = false;
  completionPanel.hidden = true;
  renderCheckpoint(checkpointPanel, { ...state, checkpoint, step, excerpt }, speech.supported);
  renderSource(sourcePanel, state.source, excerpt, step.sourceQuote, speech.supported);
  syncReviewViewport();
}

function renderTrailProgress(): void {
  if (!state) return;
  const total = state.checkpointSet.checkpoints.length;
  const percent = state.session.phase === "complete" ? 100 : total <= 1 ? 0 :
    Math.round((state.session.currentCheckpointIndex / (total - 1)) * 100);
  trailProgress.style.setProperty("--trail-progress", String(percent));
  trailProgress.setAttribute("aria-valuenow", String(percent));
  trailProgress.setAttribute("aria-valuetext", `Checkpoint ${Math.min(state.session.currentCheckpointIndex + 1, total)} of ${total}`);
}

function completionActions(hasChanges: boolean): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "completion-actions";
  if (hasChanges && !revisionPacketConfirmed) {
    actions.append(button("Confirm educational/document approval", "confirm-revision", "primary"));
  }
  if (hasChanges && revisionPacketConfirmed) {
    actions.append(button("Copy revision prompt for any AI", "copy-revision-prompt", "secondary"));
    actions.append(button("Download revised Markdown", "download-revised", "success"));
  }
  actions.append(button("Download my review artifact", "download", "primary"));
  actions.append(button("Start another document", "restart", "secondary"));
  return actions;
}

async function downloadArtifact(): Promise<void> {
  if (!state) return;
  const artifact = await createReviewArtifact(state.source, state.checkpointSet, state.session);
  download(`${slug(state.source.title)}-review-v2.json`, JSON.stringify(artifact, null, 2) + "\n", "application/json");
}

async function copyRevisionPrompt(): Promise<void> {
  if (!state || state.session.phase !== "complete" || !revisionPacketConfirmed) return;
  const changes = collectReplacementRequests(state.checkpointSet, state.session);
  const prompt = createRevisionPrompt(state.source.title, state.source.text, changes);
  await navigator.clipboard.writeText(prompt);
  state = { ...state, message: "Revision prompt copied. It contains only the confirmed educational replacements." };
  render();
}

function downloadRevisedMarkdown(): void {
  if (!state || state.session.phase !== "complete" || !revisionPacketConfirmed) return;
  const replacements = collectReplacementRequests(state.checkpointSet, state.session).map(({ replacement }) => replacement);
  const revised = applyConfirmedReplacements(state.source.text, replacements);
  download(`${slug(state.source.title)}-revised.md`, revised, "text/markdown");
}

function download(filename: string, content: string, type: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function restart(): void {
  if (state) localStorage.removeItem(storageKey(state.source, state.checkpointSet));
  state = null;
  revisionPacketConfirmed = false;
  reviewPanel.hidden = true;
  setupPanel.hidden = false;
  showSetupMessage("");
}

function readDraft(source: SourceDocument, set: CheckpointSet): ReviewSession | null {
  const raw = localStorage.getItem(storageKey(source, set));
  if (!raw) return null;
  try {
    const decoded = decodeReviewSession(JSON.parse(raw), source, set);
    return decoded.ok ? decoded.session : null;
  } catch {
    return null;
  }
}

function saveDraft(): void {
  if (!state) return;
  localStorage.setItem(storageKey(state.source, state.checkpointSet), JSON.stringify(state.session));
}

function storageKey(source: SourceDocument, set: CheckpointSet): string {
  return `${storagePrefix}${source.sourceDigest}:${set.checkpointSetDigest}`;
}

function activeCheckpoint(): ReviewCheckpoint {
  if (!state) throw new Error("No review is active.");
  return state.checkpointSet.checkpoints[state.session.currentCheckpointIndex];
}

function activeStep(): LearningStep {
  if (!state) throw new Error("No review is active.");
  return activeCheckpoint().learningSteps[state.session.currentStepIndex];
}

function expectation(checkpointId: string, stepId?: string): ExpectedTransition {
  if (!state) throw new Error("No review is active.");
  return { eventId: crypto.randomUUID(), checkpointId, ...(stepId ? { stepId } : {}), phase: state.session.phase, revision: state.session.revision };
}

function replacementInput() {
  return {
    stepId: valueOf("replacement-step"),
    replacement: valueOf("replacement-text"),
    rationale: valueOf("replacement-rationale"),
  };
}

function updateReplacementOriginal(event: Event): void {
  const select = event.target as HTMLSelectElement;
  if (select.id !== "replacement-step" || !state) return;
  const step = activeCheckpoint().learningSteps.find((candidate) => candidate.stepId === select.value);
  const original = document.getElementById("replacement-original");
  if (step && original) original.textContent = `Original passage (locked): ${step.sourceQuote}`;
}

async function loadTextFile(event: Event, targetId: string): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) setValue(targetId, await file.text());
}

function button(label: string, action: string, style: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `button button--${style}`;
  node.dataset.action = action;
  node.textContent = label;
  return node;
}

function reviewerName(): string { return valueOf("reviewer-name").trim(); }
function valueOf(id: string): string { return (required(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }
function setValue(id: string, value: string): void { (required(id) as HTMLInputElement | HTMLTextAreaElement).value = value; }
function required(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}.`);
  return node;
}
function showSetupMessage(message: string): void { required("setup-message").textContent = message; }
function showSpeechStatus(message: string): void { speechStatus.textContent = message; }
function syncReviewViewport(): void {
  if (reviewPanel.hidden) return;
  const top = reviewPanel.getBoundingClientRect().top;
  const availableHeight = Math.max(0, Math.floor(window.innerHeight - top - 24));
  reviewPanel.style.setProperty("--review-viewport-height", `${availableHeight}px`);
}
function clock(): string { return new Date().toISOString(); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); }

function visibleCheckpointText(checkpoint: ReviewCheckpoint, step: LearningStep, phase: ReviewPhase): string {
  const visibleText: Partial<Record<ReviewPhase, string>> = {
    orient: checkpoint.title,
    learn: `${step.purpose}. ${step.question}. ${step.explanation}`,
    explain_back: "Explain this checkpoint in your own words.",
    confidence: "How confidently could you explain this to someone else?",
    decide: "Choose your educational disposition for this checkpoint.",
  };
  return `${checkpoint.title}. ${visibleText[phase] ?? ""}`.trim();
}
