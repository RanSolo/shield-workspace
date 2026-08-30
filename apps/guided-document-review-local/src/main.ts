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

interface TextDrafts {
  readonly explanations: Record<string, string>;
  readonly replacements: Record<string, { stepId: string; replacement: string; rationale: string }>;
}

const storagePrefix = "document-trail:v2:";
const textDraftPrefix = "document-trail:text-drafts:";
let state: AppState | null = null;
let revisionPacketConfirmed = false;
let lastTrailPercent: number | null = null;
let trailMotionTimer: number | null = null;
let sceneryScene: "a" | "b" = "a";
let trailWasComplete = false;
let replacementPreviewStepId: string | null = null;
let revisionEditorOpen = false;

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
document.addEventListener("input", (event) => saveTextDraft(event));
required("start-sample").addEventListener("click", () => void startSample());
required("start-custom").addEventListener("click", () => void startCustom());
required("copy-ai-prompt").addEventListener("click", () => void copyAiPrompt());
required("document-file").addEventListener("change", (event) => void loadTextFile(event, "document-text"));
required("checkpoint-file").addEventListener("change", (event) => void loadTextFile(event, "checkpoint-json"));
animateTrail();
void loadPreparedTrailFromLocation();

interface PreparedTrailPacket {
  readonly schemaVersion: 1;
  readonly slug: string;
  readonly title: string;
  readonly reviewerName: string;
  readonly documentText: string;
  readonly checkpoints: unknown;
}

async function loadPreparedTrailFromLocation(): Promise<void> {
  const match = window.location.pathname.match(/^\/trails\/([a-z0-9-]+)$/u);
  if (!match) return;
  try {
    const response = await fetch(`/api/trails/${match[1]}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Prepared trail not found.");
    const packet = await response.json() as PreparedTrailPacket;
    if (packet.schemaVersion !== 1 || packet.slug !== match[1]) throw new Error("Prepared trail response is malformed.");
    await beginReview(packet.title, packet.documentText, packet.checkpoints, packet.reviewerName);
  } catch (error) {
    showSetupMessage(error instanceof Error ? error.message : "Unable to load this prepared trail.");
  }
}

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
  const saved = await readDraft(source, checkpointSet, reviewer);
  const session = saved ?? await startReviewSession(source, checkpointSet, reviewer, clock);
  state = { source, checkpointSet, session, message: saved ? "Your saved V2 trail was restored." : null };
  lastTrailPercent = null;
  trailWasComplete = false;
  revisionPacketConfirmed = false;
  revisionEditorOpen = false;
  setupPanel.hidden = true;
  reviewPanel.hidden = false;
  render();
  animateTrail();
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
      await navigator.clipboard.writeText(visibleStep().sourceQuote);
      button.textContent = "✓ Passage copied";
    } catch {
      button.textContent = "Copy failed — select the text";
    }
    return;
  }
  if (!state || state.session.phase === "complete") return;
  if (action === "show-revision" || action === "hide-revision") {
    revisionEditorOpen = action === "show-revision";
    render();
    return;
  }

  const checkpoint = activeCheckpoint();
  const step = visibleStep();
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
  if (action === "save-explanation") {
    result = recordExplanation(state.session, state.checkpointSet, expected, valueOf("explanation"), clock);
  }
  if (action === "save-explanation-confidence") {
    const explanationResult = recordExplanation(
      state.session,
      state.checkpointSet,
      expected,
      valueOf("explanation"),
      clock,
    );
    result = explanationResult.ok
      ? recordConfidence(
          explanationResult.session,
          state.checkpointSet,
          replayExpectation(explanationResult.session, checkpoint.checkpointId),
          Number(button.dataset.value) as 1 | 2 | 3 | 4 | 5,
          clock,
        )
      : explanationResult;
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
    if (action === "save-explanation" || action === "save-explanation-confidence") {
      clearExplanationDraft(checkpoint.checkpointId);
    }
    if (action === "decision") clearReplacementDraft(checkpoint.checkpointId);
    state = { ...state, session: result.session, message: null };
    if (result.session.phase !== "decide") {
      replacementPreviewStepId = null;
      revisionEditorOpen = false;
    }
    saveDraft();
  }
  render();
  if (action === "advance") {
    requestAnimationFrame(() => checkpointPanel.scrollTo({ top: 0, behavior: "smooth" }));
  }
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
  if (state.session.phase === "decide" && !replacementPreviewStepId) {
    const draftStepId = readTextDrafts().replacements[checkpoint.checkpointId]?.stepId;
    if (checkpoint.learningSteps.some((step) => step.stepId === draftStepId)) replacementPreviewStepId = draftStepId ?? null;
  }
  const step = visibleStep();
  const excerpt = findSourceExcerpt(state.source, step.sourceQuote);
  checkpointPanel.hidden = false;
  sourcePanel.hidden = false;
  completionPanel.hidden = true;
  renderCheckpoint(checkpointPanel, { ...state, checkpoint, step, excerpt, revisionEditorOpen }, speech.supported);
  restoreTextDraft(checkpoint);
  renderSource(
    sourcePanel,
    state.source,
    excerpt,
    checkpoint.checkpointId,
    step.stepId,
    step.sourceQuote,
    speech.supported,
    completedSourceMarkers(),
  );
  scrollSourceToHighlight();
  syncReviewViewport();
}

function scrollSourceToHighlight(): void {
  const highlight = sourcePanel.querySelector<HTMLElement>(".source-highlight");
  if (!highlight) return;
  requestAnimationFrame(() => {
    const panelBox = sourcePanel.getBoundingClientRect();
    const highlightBox = highlight.getBoundingClientRect();
    const centeredTop = sourcePanel.scrollTop
      + highlightBox.top
      - panelBox.top
      - Math.max(0, (sourcePanel.clientHeight - highlightBox.height) / 2);
    sourcePanel.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
  });
}

function renderTrailProgress(): void {
  if (!state) return;
  const total = state.checkpointSet.checkpoints.length;
  const complete = state.session.phase === "complete";
  const percent = complete ? 100 : total <= 1 ? 0 :
    Math.round((state.session.currentCheckpointIndex / (total - 1)) * 100);
  if ((lastTrailPercent !== null && percent > lastTrailPercent) || (complete && !trailWasComplete)) animateTrail();
  trailProgress.classList.toggle("is-complete", complete);
  lastTrailPercent = percent;
  trailWasComplete = complete;
  trailProgress.style.setProperty("--trail-progress", String(percent));
  trailProgress.setAttribute("aria-valuenow", String(percent));
  trailProgress.setAttribute("aria-valuetext", `Checkpoint ${Math.min(state.session.currentCheckpointIndex + 1, total)} of ${total}`);
}

function animateTrail(): void {
  if (trailMotionTimer !== null) finishTrailAnimation();
  const nextScene = sceneryScene === "a" ? "b" : "a";
  void trailProgress.offsetWidth;
  trailProgress.classList.add("is-traveling", `travel-to-${nextScene}`);
  trailMotionTimer = window.setTimeout(() => {
    finishTrailAnimation();
  }, 5_000);
}

function finishTrailAnimation(): void {
  if (trailMotionTimer !== null) window.clearTimeout(trailMotionTimer);
  const nextScene = trailProgress.classList.contains("travel-to-b") ? "b" : "a";
  trailProgress.classList.remove("is-traveling", "travel-to-a", "travel-to-b", "scene-a", "scene-b");
  trailProgress.classList.add(`scene-${nextScene}`);
  sceneryScene = nextScene;
  trailMotionTimer = null;
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
  if (state) {
    localStorage.removeItem(storageKey(state.source, state.checkpointSet));
    localStorage.removeItem(textDraftKey(state.source));
  }
  state = null;
  revisionPacketConfirmed = false;
  revisionEditorOpen = false;
  reviewPanel.hidden = true;
  setupPanel.hidden = false;
  showSetupMessage("");
}

async function readDraft(
  source: SourceDocument,
  set: CheckpointSet,
  reviewer: ReviewSession["reviewer"],
): Promise<ReviewSession | null> {
  const raw = localStorage.getItem(storageKey(source, set));
  let exact: ReviewSession | null = null;
  if (raw) {
    try {
      const decoded = await decodeReviewSession(JSON.parse(raw), source, set);
      exact = decoded.ok ? decoded.session : null;
    } catch {
      exact = null;
    }
  }

  const carried = await carryForwardCompletedCheckpoints(source, set, reviewer);
  if (carried && reviewProgress(carried) > reviewProgress(exact)) {
    localStorage.setItem(storageKey(source, set), JSON.stringify(carried));
    return carried;
  }
  return exact;
}

async function carryForwardCompletedCheckpoints(
  source: SourceDocument,
  set: CheckpointSet,
  reviewer: ReviewSession["reviewer"],
): Promise<ReviewSession | null> {
  const prefix = `${storagePrefix}${source.sourceDigest}:`;
  let best: ReviewSession | null = null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix) || key === storageKey(source, set)) continue;
    try {
      const candidate = JSON.parse(localStorage.getItem(key) ?? "null") as {
        sourceDigest?: unknown;
        answers?: Record<string, unknown>;
      };
      if (candidate?.sourceDigest !== source.sourceDigest || !candidate.answers) continue;
      const migrated = await replayCompletedPrefix(source, set, reviewer, candidate.answers);
      if (reviewProgress(migrated) > reviewProgress(best)) best = migrated;
    } catch {
      // Ignore unrelated or malformed local drafts.
    }
  }
  return best;
}

async function replayCompletedPrefix(
  source: SourceDocument,
  set: CheckpointSet,
  reviewer: ReviewSession["reviewer"],
  priorAnswers: Record<string, unknown>,
): Promise<ReviewSession> {
  let session = await startReviewSession(source, set, reviewer, clock);
  for (const checkpoint of set.checkpoints) {
    const answer = priorAnswers[checkpoint.checkpointId] as {
      revealedStepIds?: unknown;
      explanation?: unknown;
      confidence?: unknown;
      decision?: unknown;
      replacement?: unknown;
    } | undefined;
    const stepIds = checkpoint.learningSteps.map(({ stepId }) => stepId);
    if (!answer || !Array.isArray(answer.revealedStepIds) ||
        answer.revealedStepIds.join("|") !== stepIds.join("|") ||
        (checkpoint.reviewMode !== "disposition" && typeof answer.explanation !== "string") ||
        (checkpoint.reviewMode !== "disposition" && ![1, 2, 3, 4, 5].includes(answer.confidence as number)) ||
        !["understand", "question", "revise", "approve"].includes(answer.decision as string)) break;

    let result = advancePhase(session, set, replayExpectation(session, checkpoint.checkpointId), clock);
    if (!result.ok) break;
    session = result.session;
    for (const step of checkpoint.learningSteps) {
      result = advancePhase(session, set, replayExpectation(session, checkpoint.checkpointId, step.stepId), clock);
      if (!result.ok) return session;
      session = result.session;
    }
    if (checkpoint.reviewMode !== "disposition") {
      result = recordExplanation(
        session,
        set,
        replayExpectation(session, checkpoint.checkpointId),
        answer.explanation as string,
        clock,
      );
      if (!result.ok) break;
      session = result.session;
      result = recordConfidence(
        session,
        set,
        replayExpectation(session, checkpoint.checkpointId),
        answer.confidence as 1 | 2 | 3 | 4 | 5,
        clock,
      );
      if (!result.ok) break;
      session = result.session;
    }
    result = recordDecision(session, set, replayExpectation(session, checkpoint.checkpointId), {
      decision: answer.decision as ReviewDecision,
      ...(answer.decision === "revise" && isReplacementInput(answer.replacement)
        ? { replacement: answer.replacement }
        : {}),
    }, clock);
    if (!result.ok) break;
    session = result.session;
  }
  return session;
}

function replayExpectation(session: ReviewSession, checkpointId: string, stepId?: string): ExpectedTransition {
  return {
    eventId: crypto.randomUUID(),
    checkpointId,
    ...(stepId ? { stepId } : {}),
    phase: session.phase,
    revision: session.revision,
  };
}

function isReplacementInput(value: unknown): value is { stepId: string; replacement: string; rationale?: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { stepId?: unknown; replacement?: unknown; rationale?: unknown };
  return typeof candidate.stepId === "string" && typeof candidate.replacement === "string" &&
    (candidate.rationale === null || candidate.rationale === undefined || typeof candidate.rationale === "string");
}

function reviewProgress(session: ReviewSession | null): number {
  if (!session) return -1;
  const phase = ["orient", "learn", "explain_back", "confidence", "decide", "complete"].indexOf(session.phase);
  return session.currentCheckpointIndex * 100 + session.currentStepIndex * 10 + phase;
}

function saveDraft(): void {
  if (!state) return;
  localStorage.setItem(storageKey(state.source, state.checkpointSet), JSON.stringify(state.session));
}

function storageKey(source: SourceDocument, set: CheckpointSet): string {
  return `${storagePrefix}${source.sourceDigest}:${set.checkpointSetDigest}`;
}

function textDraftKey(source: SourceDocument): string {
  return `${textDraftPrefix}${source.sourceDigest}`;
}

function readTextDrafts(): TextDrafts {
  if (!state) return { explanations: {}, replacements: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(textDraftKey(state.source)) ?? "null") as Partial<TextDrafts> | null;
    return {
      explanations: parsed?.explanations && typeof parsed.explanations === "object" ? parsed.explanations : {},
      replacements: parsed?.replacements && typeof parsed.replacements === "object" ? parsed.replacements : {},
    };
  } catch {
    return { explanations: {}, replacements: {} };
  }
}

function writeTextDrafts(drafts: TextDrafts): void {
  if (!state) return;
  localStorage.setItem(textDraftKey(state.source), JSON.stringify(drafts));
  const status = document.getElementById("draft-status");
  if (status) status.textContent = "Draft saved locally.";
}

function saveTextDraft(event: Event): void {
  if (!state || state.session.phase === "complete") return;
  const input = event.target as HTMLTextAreaElement;
  if (!(input instanceof HTMLTextAreaElement)) return;
  const checkpointId = activeCheckpoint().checkpointId;
  const drafts = readTextDrafts();
  if (input.id === "explanation") {
    writeTextDrafts({ ...drafts, explanations: { ...drafts.explanations, [checkpointId]: input.value } });
  }
  if (input.id === "replacement-text" || input.id === "replacement-rationale") {
    const prior = drafts.replacements[checkpointId] ?? { stepId: valueOf("replacement-step"), replacement: "", rationale: "" };
    writeTextDrafts({
      ...drafts,
      replacements: {
        ...drafts.replacements,
        [checkpointId]: {
          ...prior,
          stepId: valueOf("replacement-step"),
          ...(input.id === "replacement-text" ? { replacement: input.value } : { rationale: input.value }),
        },
      },
    });
  }
}

function restoreTextDraft(checkpoint: ReviewCheckpoint): void {
  if (!state) return;
  const answer = state.session.answers[checkpoint.checkpointId];
  const drafts = readTextDrafts();
  const explanation = document.getElementById("explanation") as HTMLTextAreaElement | null;
  if (explanation && !answer.explanation && drafts.explanations[checkpoint.checkpointId]) {
    explanation.value = drafts.explanations[checkpoint.checkpointId];
  }
  const replacement = drafts.replacements[checkpoint.checkpointId];
  if (!answer.replacement && replacement) {
    replacementPreviewStepId = replacement.stepId;
    const replacementStep = document.getElementById("replacement-step") as HTMLSelectElement | null;
    const replacementText = document.getElementById("replacement-text") as HTMLTextAreaElement | null;
    const replacementRationale = document.getElementById("replacement-rationale") as HTMLTextAreaElement | null;
    if (replacementStep) replacementStep.value = replacement.stepId;
    if (replacementText) replacementText.value = replacement.replacement;
    if (replacementRationale) replacementRationale.value = replacement.rationale;
    const step = checkpoint.learningSteps.find((candidate) => candidate.stepId === replacement.stepId);
    const original = document.getElementById("replacement-original");
    if (step && original) original.textContent = `Original passage (locked): ${step.sourceQuote}`;
  }
}

function clearExplanationDraft(checkpointId: string): void {
  const drafts = readTextDrafts();
  const explanations = { ...drafts.explanations };
  delete explanations[checkpointId];
  writeTextDrafts({ ...drafts, explanations });
}

function clearReplacementDraft(checkpointId: string): void {
  const drafts = readTextDrafts();
  const replacements = { ...drafts.replacements };
  delete replacements[checkpointId];
  writeTextDrafts({ ...drafts, replacements });
}

function activeCheckpoint(): ReviewCheckpoint {
  if (!state) throw new Error("No review is active.");
  return state.checkpointSet.checkpoints[state.session.currentCheckpointIndex];
}

function activeStep(): LearningStep {
  if (!state) throw new Error("No review is active.");
  return activeCheckpoint().learningSteps[state.session.currentStepIndex];
}

function visibleStep(): LearningStep {
  const checkpoint = activeCheckpoint();
  if (state?.session.phase !== "decide") return activeStep();
  const replacementStepId = state.session.answers[checkpoint.checkpointId].replacement?.stepId;
  return checkpoint.learningSteps.find((step) => step.stepId === (replacementPreviewStepId ?? replacementStepId))
    ?? checkpoint.learningSteps[0];
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
  if (!step) return;
  replacementPreviewStepId = step.stepId;
  const drafts = readTextDrafts();
  const prior = drafts.replacements[activeCheckpoint().checkpointId] ?? { replacement: "", rationale: "", stepId: step.stepId };
  writeTextDrafts({
    ...drafts,
    replacements: { ...drafts.replacements, [activeCheckpoint().checkpointId]: { ...prior, stepId: step.stepId } },
  });
  if (original) original.textContent = `Original passage (locked): ${step.sourceQuote}`;
  const excerpt = findSourceExcerpt(state.source, step.sourceQuote);
  renderSource(
    sourcePanel,
    state.source,
    excerpt,
    activeCheckpoint().checkpointId,
    step.stepId,
    step.sourceQuote,
    speech.supported,
    completedSourceMarkers(),
  );
  scrollSourceToHighlight();
}

function completedSourceMarkers(): readonly {
  checkpointId: string;
  stepId: string;
  sourceQuote: string;
  status: "passed" | "revised";
}[] {
  if (!state) return [];
  return state.checkpointSet.checkpoints.flatMap((checkpoint) => {
    const decision = state?.session.answers[checkpoint.checkpointId]?.decision;
    return decision === "approve" || decision === "revise"
      ? checkpoint.learningSteps.map((step) => ({
          checkpointId: checkpoint.checkpointId,
          stepId: step.stepId,
          sourceQuote: step.sourceQuote,
          status: decision === "approve" ? "passed" as const : "revised" as const,
        }))
      : [];
  });
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
