import {
  advancePhase,
  checkpointsFromHeadings,
  createCheckpointSet,
  createReviewArtifact,
  createSourceDocument,
  findSourceExcerpt,
  recordConfidence,
  recordDecision,
  recordExplanation,
  sessionMatches,
  startReviewSession,
  type CheckpointSet,
  type ExpectedTransition,
  type ReviewDecision,
  type ReviewSession,
  type SourceDocument,
} from "@shield/guided-document-review";

import { renderCheckpoint, renderCompletion, renderJourney, renderSource, renderStats } from "./render.js";
import { sampleCheckpoints, sampleDocument } from "./sample-review.js";

interface AppState {
  source: SourceDocument;
  checkpointSet: CheckpointSet;
  session: ReviewSession;
  message: string | null;
}

const storagePrefix = "document-trail:v1:";
let state: AppState | null = null;

const setupPanel = required("setup-panel");
const reviewPanel = required("review-panel");
const journey = required("journey");
const checkpointPanel = required("checkpoint-panel");
const sourcePanel = required("source-panel");
const stats = required("stats");
const completionPanel = required("completion-panel");

document.addEventListener("click", (event) => void handleClick(event));
required("start-sample").addEventListener("click", () => void startSample());
required("start-custom").addEventListener("click", () => void startCustom());
required("document-file").addEventListener("change", (event) => void loadTextFile(event, "document-text"));
required("checkpoint-file").addEventListener("change", (event) => void loadTextFile(event, "checkpoint-json"));

async function startSample(): Promise<void> {
  await beginReview("Mission Rail V1", sampleDocument, sampleCheckpoints, reviewerName());
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

async function beginReview(title: string, text: string, checkpoints: unknown, name: string): Promise<void> {
  const source = await createSourceDocument(title, text);
  const checkpointSet = await createCheckpointSet(`${title} learning trail`, checkpoints);
  const reviewer = name ? { kind: "self_asserted" as const, name } : { kind: "unattributed" as const, name: null };
  const saved = readDraft(source, checkpointSet);
  const session = saved ?? await startReviewSession(source, checkpointSet, reviewer, clock);
  state = { source, checkpointSet, session, message: saved ? "Your saved trail was restored." : null };
  setupPanel.hidden = true;
  reviewPanel.hidden = false;
  render();
}

async function handleClick(event: MouseEvent): Promise<void> {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "restart") return restart();
  if (button.dataset.action === "download") return void downloadArtifact();
  if (!state || state.session.phase === "complete") return;

  const checkpoint = activeCheckpoint();
  const expected = expectation(checkpoint.checkpointId);
  const action = button.dataset.action;
  let result;
  if (action === "advance") result = advancePhase(state.session, expected, clock);
  if (action === "save-explanation") {
    result = recordExplanation(state.session, expected, valueOf("explanation"), clock);
  }
  if (action === "confidence") {
    result = recordConfidence(state.session, expected, Number(button.dataset.value) as 1 | 2 | 3 | 4 | 5, clock);
  }
  if (action === "decision") {
    result = recordDecision(state.session, state.checkpointSet, expected, button.dataset.value as ReviewDecision, clock);
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
  renderJourney(journey, state);
  renderStats(stats, state.session, state.checkpointSet.checkpoints.length);
  if (state.session.phase === "complete") {
    checkpointPanel.hidden = true;
    sourcePanel.hidden = true;
    completionPanel.hidden = false;
    renderCompletion(completionPanel, state.session);
    completionPanel.append(completionActions());
    return;
  }
  const checkpoint = activeCheckpoint();
  const excerpt = findSourceExcerpt(state.source, checkpoint.sourceSearch);
  checkpointPanel.hidden = false;
  sourcePanel.hidden = false;
  completionPanel.hidden = true;
  renderCheckpoint(checkpointPanel, { ...state, checkpoint, excerpt });
  renderSource(sourcePanel, state.source, excerpt);
}

function completionActions(): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "completion-actions";
  actions.append(button("Download my review artifact", "download", "primary"));
  actions.append(button("Start another document", "restart", "secondary"));
  return actions;
}

async function downloadArtifact(): Promise<void> {
  if (!state) return;
  const artifact = await createReviewArtifact(state.source, state.checkpointSet, state.session);
  const blob = new Blob([`${JSON.stringify(artifact, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(state.source.title)}-review.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function restart(): void {
  if (state) localStorage.removeItem(storageKey(state.source, state.checkpointSet));
  state = null;
  reviewPanel.hidden = true;
  setupPanel.hidden = false;
  showSetupMessage("");
}

function readDraft(source: SourceDocument, set: CheckpointSet): ReviewSession | null {
  const raw = localStorage.getItem(storageKey(source, set));
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as ReviewSession;
    return isSessionShape(candidate) && sessionMatches(candidate, source, set) ? candidate : null;
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

function activeCheckpoint() {
  if (!state) throw new Error("No review is active.");
  return state.checkpointSet.checkpoints[state.session.currentCheckpointIndex];
}

function expectation(checkpointId: string): ExpectedTransition {
  if (!state) throw new Error("No review is active.");
  return {
    eventId: crypto.randomUUID(),
    checkpointId,
    phase: state.session.phase,
    revision: state.session.revision,
  };
}

function isSessionShape(value: unknown): value is ReviewSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReviewSession>;
  return candidate.schemaVersion === 1 && typeof candidate.sessionId === "string" &&
    typeof candidate.sourceDigest === "string" && typeof candidate.checkpointSetDigest === "string" &&
    typeof candidate.revision === "number" && Array.isArray(candidate.events) &&
    candidate.answers !== null && typeof candidate.answers === "object";
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
function valueOf(id: string): string { return (required(id) as HTMLInputElement | HTMLTextAreaElement).value; }
function setValue(id: string, value: string): void { (required(id) as HTMLInputElement | HTMLTextAreaElement).value = value; }
function required(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}.`);
  return node;
}
function showSetupMessage(message: string): void { required("setup-message").textContent = message; }
function clock(): string { return new Date().toISOString(); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); }
