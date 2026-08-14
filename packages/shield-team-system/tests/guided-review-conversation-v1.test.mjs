import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGuidedReviewAnswerEnvelopeV1,
  createGuidedReviewAutomatedCheckSourceV1,
  createGuidedReviewFollowUpV1,
  createGuidedReviewQuestionEnvelopeV1,
  parseGuidedReviewResponseV1,
  validateGuidedReviewAnswerEnvelopeV1,
  validateGuidedReviewAutomatedCheckReceiptV1,
  validateGuidedReviewAutomatedCheckSourceV1,
  validateGuidedReviewFollowUpV1,
  validateGuidedReviewQuestionEnvelopeV1,
} from "../dist/guided-review-conversation-v1.mjs";
import { answerGuidedReviewConversationHostV1, currentGuidedReviewQuestionHostV1,
  GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_FILENAME_V1,
  readGuidedReviewAutomatedCheckSourceBytesHostV1 } from "../dist/guided-review-conversation-host-v1.mjs";
import { renderGuidedReviewAutomatedChecksV1 } from "../dist/mission-cli.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";

const digest = (character) => `sha256:${character.repeat(43)}`;

function questionInput(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "guided.review.question.v1",
    missionId: "mission:issue-305",
    exactRevision: "1".repeat(40),
    requestDigest: digest("a"),
    sessionId: "guided-review-session:issue-305",
    sessionDigest: digest("b"),
    stageId: "stage:behavior",
    checkpointId: "checkpoint:behavior",
    stepId: "step:behavior",
    projectionDigest: digest("c"),
    question: "Does the exact behavior satisfy the reviewed intent?",
    ...overrides,
  };
}

test("question and answer envelopes are deterministic, closed, and content-addressed", () => {
  const question = createGuidedReviewQuestionEnvelopeV1(questionInput());
  assert.equal(question.state, "ready");
  assert.equal(validateGuidedReviewQuestionEnvelopeV1(question.value).state, "ready");
  const answer = createGuidedReviewAnswerEnvelopeV1({ schemaVersion: 1, contractVersion: "guided.review.answer.v1",
    questionDigest: question.value.questionDigest, rawResponse: " PASS\t", finding: null, condition: null });
  assert.equal(answer.state, "ready");
  assert.equal(validateGuidedReviewAnswerEnvelopeV1(answer.value).state, "ready");
  assert.equal(answer.value.rawResponse, " PASS\t");
  assert.ok(Object.isFrozen(answer.value));
});

test("raw response grammar recognizes only one ASCII token with outer SP or HTAB", () => {
  for (const [raw, disposition] of [["PASS", "pass"], [" pass ", "pass"], ["\tFaIl\t", "fail"],
    ["NOT_OBSERVED", "not_observed"], [" conditional_pass ", "conditional_pass"]]) {
    assert.deepEqual(parseGuidedReviewResponseV1(raw), { state: "recognized", disposition, canonicalResponse: disposition.toUpperCase() });
  }
  for (const raw of ["PASS.", "PASS because", "PASS FAIL", "ＰＡＳＳ", "PASS\n", "PASS\r\n", "", " PASS\u00a0"]) {
    assert.deepEqual(parseGuidedReviewResponseV1(raw), { state: "confirmation_required" }, raw);
  }
});

test("conversation envelopes reject open, tampered, cross-bound, and non-exact detail bytes", () => {
  const question = createGuidedReviewQuestionEnvelopeV1(questionInput());
  assert.equal(question.state, "ready");
  assert.equal(createGuidedReviewQuestionEnvelopeV1({ ...questionInput(), extra: true }).state, "invalid");
  assert.equal(validateGuidedReviewQuestionEnvelopeV1({ ...question.value, stepId: "step:other" }).state, "invalid");
  const base = { schemaVersion: 1, contractVersion: "guided.review.answer.v1", questionDigest: question.value.questionDigest,
    rawResponse: "FAIL", finding: "exact finding", condition: null };
  assert.equal(createGuidedReviewAnswerEnvelopeV1({ ...base, finding: " exact finding" }).state, "invalid");
  assert.equal(createGuidedReviewAnswerEnvelopeV1({ ...base, extra: true }).state, "invalid");
});

test("conversation host surface is explicit and asynchronous", () => {
  assert.equal(typeof answerGuidedReviewConversationHostV1, "function");
  assert.equal(answerGuidedReviewConversationHostV1.constructor.name, "AsyncFunction");
});

function hostFixture({ failNextProjection = false } = {}) {
  let sessionDigest = digest("b");
  let stepId = "step:behavior";
  let answers = 0;
  let lastDecision = null;
  let projectCalls = 0;
  let revalidateCalls = 0;
  const resolution = { state: "guided_review_ready", exactRevision: "1".repeat(40), request: { requestDigest: digest("a") },
    playbook: { stages: [{ stageId: "stage:behavior", checkpointId: "checkpoint:behavior", steps: [
      { stepId: "step:behavior", question: "Does the exact behavior satisfy the reviewed intent?" },
      { stepId: "step:next", question: "Does the next exact behavior pass review?" },
    ] }] } };
  const preparation = { state: "publication_ready", missionId: "mission:issue-305",
    observation: { repositoryId: "shield-ai/shield", canonicalRoot: "/workspace" } };
  const projectionFor = (expected) => expected !== sessionDigest
    ? { state: "projection_stale", code: "GUIDED_REVIEW_PROJECTION_STALE", errors: ["stale"] }
    : failNextProjection && stepId === "step:next"
      ? { state: "projection_unavailable", code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE", errors: ["next unavailable"] }
    : { state: "ready", projectionPath: "/workspace/current-projection.json", projection: {
      missionId: preparation.missionId, exactRevision: resolution.exactRevision, requestDigest: resolution.request.requestDigest,
      sessionId: "guided-review-session:issue-305", sessionDigest, stageId: "stage:behavior", checkpointId: "checkpoint:behavior",
      stepId, projectionDigest: stepId === "step:behavior" ? digest("c") : digest("d"),
    } };
  const dependencies = {
    async projectCurrent(input) { projectCalls += 1; return projectionFor(input.expectedSessionDigest); },
    async revalidateCurrent(input) {
      revalidateCalls += 1;
      const projected = projectionFor(input.expectedSessionDigest);
      return projected.state === "ready" ? { state: "ready", projection: projected.projection } : projected;
    },
    async answerCurrent(input) {
      if (input.expectedSessionDigest !== sessionDigest) return { state: "invalid", code: "GUIDED_REVIEW_ANSWER_STALE", errors: ["stale"] };
      answers += 1;
      lastDecision = input;
      sessionDigest = digest("n");
      stepId = "step:next";
      return { state: "ready", value: { state: "active", sessionDigest, decisions: [{ decisionId: "decision:one" }] } };
    },
  };
  return { preparation, resolution, dependencies, get answers() { return answers; }, get lastDecision() { return lastDecision; },
    get sessionDigest() { return sessionDigest; }, get projectCalls() { return projectCalls; }, get revalidateCalls() { return revalidateCalls; } };
}

async function displayedQuestion(fixture) {
  const result = await currentGuidedReviewQuestionHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, expectedSessionDigest: digest("b") }, { projectCurrent: fixture.dependencies.projectCurrent });
  assert.equal(result.state, "question_ready", JSON.stringify(result));
  return result.questionEnvelope;
}

function answerFor(question, rawResponse, finding = null, condition = null) {
  const result = createGuidedReviewAnswerEnvelopeV1({ schemaVersion: 1, contractVersion: "guided.review.answer.v1",
    questionDigest: question.questionDigest, rawResponse, finding, condition });
  assert.equal(result.state, "ready", JSON.stringify(result));
  return result.value;
}

test("confirmation and required-detail follow-ups preserve the same question and perform zero CAS mutations", async () => {
  for (const [rawResponse, expectedState, requiredField] of [["PASS because", "confirmation_required", undefined],
    ["FAIL", "follow_up_required", "finding"], ["NOT_OBSERVED", "follow_up_required", "finding"],
    ["CONDITIONAL_PASS", "follow_up_required", "condition"]]) {
    const fixture = hostFixture();
    const question = await displayedQuestion(fixture);
    const projectCalls = fixture.projectCalls;
    const revalidateCalls = fixture.revalidateCalls;
    const result = await answerGuidedReviewConversationHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
      resolution: fixture.resolution, questionEnvelope: question, answerEnvelope: answerFor(question, rawResponse),
      decidedAt: "2026-08-14T12:00:00.000Z" }, fixture.dependencies);
    assert.equal(result.state, expectedState, JSON.stringify(result));
    assert.deepEqual(result.questionEnvelope, question);
    if (requiredField !== undefined) assert.equal(result.requiredField, requiredField);
    assert.equal(fixture.answers, 0);
    assert.equal(fixture.projectCalls, projectCalls);
    assert.equal(fixture.revalidateCalls, revalidateCalls);
  }
});

test("ambiguous and missing-detail answers preserve journal, session, projection inode/bytes, and absent paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guided-review-answer-"));
  try {
    const paths = ["journal.jsonl", "session.json", "current-projection.json"].map((name) => join(directory, name));
    await Promise.all(paths.map((path, index) => writeFile(path, `exact-${index}\n`, { mode: 0o600 })));
    const absent = join(directory, "absent-current-projection.json");
    const before = await Promise.all(paths.map(async (path) => ({ bytes: await readFile(path, "utf8"), stat: await lstat(path) })));
    const question = createGuidedReviewQuestionEnvelopeV1(questionInput()).value;
    let calls = 0;
    const dependencies = {
      async projectCurrent() { calls += 1; throw new Error("must not project"); },
      async revalidateCurrent() { calls += 1; throw new Error("must not revalidate"); },
      async answerCurrent() { calls += 1; throw new Error("must not mutate"); },
    };
    for (const rawResponse of ["PASS because", "FAIL", "NOT_OBSERVED", "CONDITIONAL_PASS"]) {
      const result = await answerGuidedReviewConversationHostV1({ repositoryRoot: directory,
        preparation: { state: "publication_ready", missionId: question.missionId },
        resolution: { state: "guided_review_ready" }, questionEnvelope: question,
        answerEnvelope: answerFor(question, rawResponse), decidedAt: "2026-08-14T12:00:00.000Z" }, dependencies);
      assert.ok(["confirmation_required", "follow_up_required"].includes(result.state));
    }
    const after = await Promise.all(paths.map(async (path) => ({ bytes: await readFile(path, "utf8"), stat: await lstat(path) })));
    assert.equal(calls, 0);
    for (let index = 0; index < paths.length; index += 1) {
      assert.equal(after[index].bytes, before[index].bytes);
      assert.equal(after[index].stat.dev, before[index].stat.dev);
      assert.equal(after[index].stat.ino, before[index].stat.ino);
    }
    await assert.rejects(lstat(absent), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("exact PASS advances once with canonical PASS and immediately returns the next bound question and projection", async () => {
  const fixture = hostFixture();
  const question = await displayedQuestion(fixture);
  const envelope = answerFor(question, "\tpass ");
  const result = await answerGuidedReviewConversationHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, questionEnvelope: question, answerEnvelope: envelope,
    decidedAt: "2026-08-14T12:00:00.000Z" }, fixture.dependencies);
  assert.equal(result.state, "answered", JSON.stringify(result));
  assert.equal(result.completed, false);
  assert.equal(result.priorQuestionDigest, question.questionDigest);
  assert.equal(result.nextQuestionEnvelope.stepId, "step:next");
  assert.equal(result.nextQuestionEnvelope.sessionDigest, fixture.sessionDigest);
  assert.equal(result.projection.state, "ready");
  assert.equal(fixture.answers, 1);
  assert.equal(fixture.revalidateCalls, 1);
  assert.equal(fixture.lastDecision.observation, "PASS");
  assert.equal(fixture.lastDecision.finding, null);
  assert.equal(fixture.lastDecision.condition, null);

  const duplicate = await answerGuidedReviewConversationHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, questionEnvelope: question, answerEnvelope: envelope,
    decidedAt: "2026-08-14T12:00:01.000Z" }, fixture.dependencies);
  assert.equal(duplicate.state, "invalid");
  assert.equal(duplicate.code, "GUIDED_REVIEW_ANSWER_STALE");
  assert.equal(fixture.answers, 1);
});

test("question host projects automated checks only from exact closed host-read source bytes", async () => {
  const fixture = hostFixture();
  const sourceInput = (overrides = {}) => ({ schemaVersion: 1, contractVersion: "guided.review.automated-check-source.v1",
    authority: "none", provenance: "persisted_advisory_command_observation", missionId: fixture.preparation.missionId,
    repositoryId: fixture.preparation.observation.repositoryId, canonicalRoot: fixture.preparation.observation.canonicalRoot,
    requestDigest: fixture.resolution.request.requestDigest, sessionId: "guided-review-session:issue-305", sessionDigest: digest("b"),
    exactRevision: fixture.resolution.exactRevision, evidenceSourceId: "evidence-source:focused-tests", checks: [
      { commandId: "check:focused", command: "npm", argv: ["exec", "nx", "--", "test"], outcome: "passed", exitCode: 0 },
    ], ...overrides });
  const source = createGuidedReviewAutomatedCheckSourceV1(sourceInput());
  assert.equal(source.state, "ready");
  assert.equal(validateGuidedReviewAutomatedCheckSourceV1(source.value).state, "ready");
  const sourceBytes = canonicalJson(source.value);
  const displayed = await currentGuidedReviewQuestionHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, expectedSessionDigest: digest("b") },
  { projectCurrent: fixture.dependencies.projectCurrent, async readAutomatedCheckSourceBytes() { return sourceBytes; } });
  assert.equal(displayed.state, "question_ready");
  assert.equal(displayed.automatedChecks.state, "available");
  const receipt = displayed.automatedChecks.receipts[0];
  assert.equal(validateGuidedReviewAutomatedCheckReceiptV1(receipt).state, "ready");
  assert.equal(receipt.authority, "none");
  assert.equal(receipt.provenance, "host_exact_source_bytes");
  assert.equal(receipt.missionId, fixture.preparation.missionId);
  assert.equal(receipt.repositoryId, fixture.preparation.observation.repositoryId);
  assert.equal(receipt.canonicalRoot, fixture.preparation.observation.canonicalRoot);
  assert.equal(receipt.requestDigest, fixture.resolution.request.requestDigest);
  assert.equal(receipt.sessionDigest, digest("b"));
  assert.equal(receipt.exactRevision, fixture.resolution.exactRevision);
  assert.equal(receipt.sourceByteSha256, `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`);
  assert.deepEqual(renderGuidedReviewAutomatedChecksV1(displayed.automatedChecks), [
    `  - check:focused: command="npm" argv=["exec","nx","--","test"] outcome=passed exitCode=0 authority=none provenance=host_exact_source_bytes sourceByteSha256=${receipt.sourceByteSha256}`,
  ]);
  assert.equal(validateGuidedReviewAutomatedCheckReceiptV1({ ...receipt, sourceByteSha256: `sha256:${"0".repeat(64)}` }).state, "invalid");

  const forgedByQuestionCaller = await currentGuidedReviewQuestionHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, expectedSessionDigest: digest("b"), automatedCheckReceipts: [receipt] },
  { projectCurrent: fixture.dependencies.projectCurrent, async readAutomatedCheckSourceBytes() { return null; } });
  assert.equal(forgedByQuestionCaller.state, "question_ready");
  assert.equal(forgedByQuestionCaller.automatedChecks.state, "unavailable");

  const wrongSources = [
    `${sourceBytes}\n`,
    canonicalJson({ ...source.value, checks: [{ ...source.value.checks[0], outcome: "failed" }] }),
    canonicalJson(createGuidedReviewAutomatedCheckSourceV1(sourceInput({ sessionDigest: digest("x") })).value),
    canonicalJson(createGuidedReviewAutomatedCheckSourceV1(sourceInput({ exactRevision: "2".repeat(40) })).value),
  ];
  for (const bytes of wrongSources) {
    const rejected = await currentGuidedReviewQuestionHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
      resolution: fixture.resolution, expectedSessionDigest: digest("b") },
    { projectCurrent: fixture.dependencies.projectCurrent, async readAutomatedCheckSourceBytes() { return bytes; } });
    assert.equal(rejected.state, "invalid");
    assert.ok(["MALFORMED_GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE", "GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_STALE"].includes(rejected.code));
  }
});

test("secure automated-check source read rejects post-read descriptor and path drift", async (t) => {
  for (const kind of ["chmod", "hardlink", "path-replacement", "symlink-replacement"]) await t.test(kind, async () => {
    const directory = await mkdtemp(join(tmpdir(), "guided-review-check-source-"));
    try {
      const path = join(directory, GUIDED_REVIEW_AUTOMATED_CHECK_SOURCE_FILENAME_V1);
      const moved = join(directory, "moved-source.json");
      const linked = join(directory, "linked-source.json");
      await writeFile(path, '{"exact":"source-bytes"}', { mode: 0o600 });
      const result = await readGuidedReviewAutomatedCheckSourceBytesHostV1({ resolution: { paths: { packageDirectory: directory } } }, {
        async afterSourceRead() {
          if (kind === "chmod") await chmod(path, 0o640);
          else if (kind === "hardlink") await link(path, linked);
          else {
            await rename(path, moved);
            if (kind === "path-replacement") await writeFile(path, '{"exact":"source-bytes"}', { mode: 0o600 });
            else await symlink(moved, path);
          }
        },
      });
      assert.equal(result, null);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test("authority-none follow-ups preserve exact findings and issue identity deterministically without effects", () => {
  const input = { schemaVersion: 1, contractVersion: "guided.review.follow-up.v1", authority: "none",
    effect: "external_issue_creation_not_authorized", missionId: "mission:issue-305", repositoryId: "shield-ai/shield",
    exactRevision: "1".repeat(40), sessionId: "guided-review-session:issue-305", sourceDecisionId: "decision:one",
    sourceDecisionDigest: digest("d"), finding: "Exact observed behavior differs at byte 17.", blocking: false,
    parentIssue: { repositoryId: "shield-ai/shield", number: 305, nodeId: "I_kwDO305", url: "https://github.com/shield-ai/shield/issues/305" },
    linkedIssue: null };
  const first = createGuidedReviewFollowUpV1(input);
  const retry = createGuidedReviewFollowUpV1(input);
  assert.equal(first.state, "ready");
  assert.deepEqual(retry, first);
  assert.equal(first.value.finding, input.finding);
  assert.equal(first.value.authority, "none");
  assert.equal(first.value.effect, "external_issue_creation_not_authorized");
  assert.equal(validateGuidedReviewFollowUpV1(first.value).state, "ready");
  for (const substitution of [
    { ...first.value, finding: "substituted" },
    { ...first.value, parentIssue: { ...first.value.parentIssue, number: 306 } },
    { ...first.value, authority: "write" },
  ]) assert.equal(validateGuidedReviewFollowUpV1(substitution).state, "invalid");
});

test("wrong-step, wrong-HEAD, and question/answer digest substitution fail before CAS", async () => {
  for (const change of [
    { stepId: "step:next" },
    { exactRevision: "2".repeat(40) },
  ]) {
    const fixture = hostFixture();
    const current = await displayedQuestion(fixture);
    const { questionDigest: _digest, ...body } = current;
    const substituted = createGuidedReviewQuestionEnvelopeV1({ ...body, ...change });
    assert.equal(substituted.state, "ready");
    const result = await answerGuidedReviewConversationHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
      resolution: fixture.resolution, questionEnvelope: substituted.value, answerEnvelope: answerFor(substituted.value, "PASS"),
      decidedAt: "2026-08-14T12:00:00.000Z" }, fixture.dependencies);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "GUIDED_REVIEW_ANSWER_STALE");
    assert.equal(fixture.answers, 0);
  }
});

test("next projection failure after accepted PASS never rolls back the durable decision", async () => {
  const fixture = hostFixture({ failNextProjection: true });
  const question = await displayedQuestion(fixture);
  const result = await answerGuidedReviewConversationHostV1({ repositoryRoot: "/workspace", preparation: fixture.preparation,
    resolution: fixture.resolution, questionEnvelope: question, answerEnvelope: answerFor(question, "PASS"),
    decidedAt: "2026-08-14T12:00:00.000Z" }, fixture.dependencies);
  assert.equal(result.state, "answered", JSON.stringify(result));
  assert.equal(result.completed, false);
  assert.equal(result.nextQuestionEnvelope, null);
  assert.equal(result.projection.state, "projection_unavailable");
  assert.equal(fixture.answers, 1);
  assert.equal(fixture.lastDecision.observation, "PASS");
});
