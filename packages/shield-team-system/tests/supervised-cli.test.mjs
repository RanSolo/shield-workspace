import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createSupervisedMissionBrief,
} from "../dist/mission-v2.mjs";
import { canonicalDelegationJson, createWheelsOffDelegation, createWheelsOffEligibility } from "../dist/delegation-v1.mjs";
import {
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  MISSION_130_JOURNAL_DIGEST,
} from "../dist/profile-aware-mission-v1.mjs";
import { readInteractivePasscode } from "../dist/mission-cli.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");

function journalPath(root, missionId) {
  return join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
}

function authority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId: `human:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef,
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

async function fixture(requireSimmons = false) {
  const root = await mkdtemp(join(tmpdir(), "shield-supervised-"));
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  await mkdir(join(root, ".shield"));
  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const simmons = authority("simmons");
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: coulson.binding.signingKeyRef,
    fitzBindingRef: fitz.binding.signingKeyRef,
    ...(requireSimmons ? { simmonsBindingRef: simmons.binding.signingKeyRef } : {}),
  });
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");
  await writeFile(join(root, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({
    schemaVersion: 1,
    bindings: requireSimmons ? [coulson.binding, fitz.binding, simmons.binding] : [coulson.binding, fitz.binding],
  }, null, 2)}\n`);
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: requireSimmons ? "mission:cli-simmons" : "mission:cli",
    objective: "Exercise one local supervised mission with no external effects.",
    subjectId: "issue:39",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: false,
    },
    participants: ["hill", "daisy", "fury", "may", "coulson", "fitz", ...(requireSimmons ? ["simmons"] : [])]
      .map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "mission-brief" }],
    requireSimmons,
    createdAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" },
  });
  await writeFile(join(root, "mission-brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
  return { root, brief, coulson, fitz, simmons };
}

async function profileAwareFixture() {
  const current = await fixture();
  const missionId = "mission:cli-profile-aware";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Read one profile-aware mission without changing it.",
    subjectId: "issue:130",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: true,
    },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-29T15:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const entry = createProfileAwareMissionBegunEntry(brief, [current.coulson.binding, current.fitz.binding]);
  const journalRoot = join(current.root, ".shield", "journals");
  const path = journalPath(current.root, missionId);
  await mkdir(journalRoot, { recursive: true });
  await writeFile(path, `${JSON.stringify(entry)}\n`);
  return { ...current, brief, entry, journalPath: path };
}

function run(root, args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
  });
}

function evidenceGovernanceTarget(decision, resumeState = "approved") {
  if (decision === "approved") return "approved";
  if (decision === "paused") return "paused";
  if (decision === "resumed") return resumeState;
  if (decision === "cancelled") return "cancelled";
  return null;
}

function signedEvidence(authorityRecord, projection, requirement, decision, sequence, timestamp, resumeState = "approved") {
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:${authorityRecord.binding.seatId}:${sequence}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: "mission_plan",
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    seatId: authorityRecord.binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision,
    governanceTarget: authorityRecord.binding.seatId === "coulson" ? evidenceGovernanceTarget(decision, resumeState) : null,
    humanPrincipalId: authorityRecord.binding.humanPrincipalId,
    bindingId: authorityRecord.binding.bindingId,
    signingKeyRef: authorityRecord.binding.signingKeyRef,
    sourceRef: `fixture-signature:${sequence}`,
    timestamp: { value: timestamp, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authorityRecord.privateKey).toString("base64") };
}

async function writeEvidence(root, name, envelope) {
  const path = join(root, name);
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return name;
}

const PASSCODE_PROMPT_FAILURE_MESSAGE = "Passcode prompt failed.";

function createInteractivePromptFixture({
  syncData,
  failSetRawMode = false,
  failOnDataRegistration = false,
  failResume = false,
  failOff = false,
  failSetRawModeRestore = false,
  failPause = false,
  failNewline = false,
} = {}) {
  const stream = new EventEmitter();
  const calls = {
    setRawMode: 0,
    on: 0,
    off: 0,
    resume: 0,
    pause: 0,
    write: 0,
  };
  const output = [];
  const outputStream = {
    write(value) {
      calls.write += 1;
      output.push(value);
      if (failNewline && value === "\n") throw new Error("Prompt write failure.");
      return true;
    },
  };
  const inputStream = {
    setRawMode(mode) {
      calls.setRawMode += 1;
      if (mode ? failSetRawMode : failSetRawModeRestore) throw new Error("setRawMode failure.");
    },
    on(eventName, listener) {
      calls.on += 1;
      if (failOnDataRegistration) throw new Error("on() registration failure.");
      stream.on(eventName, listener);
    },
    off(eventName, listener) {
      calls.off += 1;
      if (failOff) throw new Error("off() failure.");
      stream.off(eventName, listener);
    },
    resume() {
      calls.resume += 1;
      if (failResume) throw new Error("resume() failure.");
      if (syncData) stream.emit("data", syncData);
    },
    pause() {
      calls.pause += 1;
      if (failPause) throw new Error("pause() failure.");
    },
    emitData(chunk) {
      stream.emit("data", chunk);
    },
  };
  return { inputStream, outputStream, calls, output };
}

async function readJournalEntries(root, missionId) {
  const contents = await readFile(journalPath(root, missionId), "utf8");
  return contents
    .split("\n")
    .filter((entry) => entry.length > 0)
    .map((entry) => JSON.parse(entry));
}

test("packed CLI path completes execution while Fitz readiness remains waiting", async () => {
  const { root, brief, coulson, fitz } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.governance.state, "proposed");
  assert.equal(projection.readiness.execute.state, "waiting");

  const authorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const approvalPath = await writeEvidence(root, "coulson-approve.json", signedEvidence(
    coulson, projection, authorization, "approved", 1, "2020-01-01T00:01:00Z",
  ));
  const approved = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", approvalPath, "--json"]);
  assert.equal(approved.status, 0, approved.stderr);
  projection = JSON.parse(approved.stdout);
  assert.equal(projection.governance.state, "approved");

  const first = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).projection.execution.status, "running");
  const second = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(second.status, 0, second.stderr);
  projection = JSON.parse(second.stdout).projection;
  assert.equal(projection.execution.status, "completed");
  assert.equal(projection.readiness.accept.state, "waiting");
  assert.equal(projection.readiness.accept.requirementStatuses[0].requiredSeatId, "fitz");

  const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
  const beforeNoop = await readFile(journalPath, "utf8");
  const noop = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(noop.status, 0, noop.stderr);
  assert.equal(JSON.parse(noop.stdout).outcome, "completed-noop");
  assert.equal(await readFile(journalPath, "utf8"), beforeNoop);

  const fitzRequirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "technical_review");
  const future = new Date(Date.now() + 60_000).toISOString();
  const fitzPath = await writeEvidence(root, "fitz-review.json", signedEvidence(fitz, projection, fitzRequirement, "approved", 4, future));
  const recorded = run(root, ["evidence", "record", "--mission-id", brief.missionId, "--evidence", fitzPath, "--json"]);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).readiness.accept.state, "ready");

  const beforeReadOnlyCommands = await readFile(journalPath, "utf8");
  const status = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).entries.length, 5);
  assert.equal(await readFile(journalPath, "utf8"), beforeReadOnlyCommands);
});

test("packed CLI status and report replay schema 9 without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const before = await readFile(journalPath, "utf8");
  const status = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  const projection = JSON.parse(status.stdout);
  assert.equal(projection.schemaVersion, 9);
  assert.equal(projection.authorization, "waiting");
  assert.equal(projection.readiness.execute, "waiting");

  const human = run(root, ["mission", "status", "--mission-id", brief.missionId]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Profile: standard@1/u);
  assert.match(human.stdout, /Next journal sequence: 1/u);

  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(report.status, 0, report.stderr);
  const parsedReport = JSON.parse(report.stdout);
  assert.deepEqual(parsedReport.entries, [entry]);
  assert.equal(parsedReport.projection.schemaVersion, 9);
  assert.equal(await readFile(journalPath, "utf8"), before);
});

test("packed CLI rejects mixed schema 9 and legacy entries without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const mixed = `${JSON.stringify(entry)}\n${JSON.stringify({ ...entry, schemaVersion: 8 })}\n`;
  await writeFile(journalPath, mixed);
  const result = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /schema_mixed/u);
  assert.equal(await readFile(journalPath, "utf8"), mixed);
});

test("packed CLI rejects an unknown journal schema without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const unknown = `${JSON.stringify({ ...entry, schemaVersion: 10 })}\n`;
  await writeFile(journalPath, unknown);
  const result = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /unsupported_schema/u);
  assert.equal(await readFile(journalPath, "utf8"), unknown);
});

test("packed CLI status rejects a profile-aware journal stored for another mission", async () => {
  const { root, journalPath: sourcePath } = await profileAwareFixture();
  const requestedMissionId = "mission:cli-profile-aware-alias";
  const bytes = await readFile(sourcePath, "utf8");
  const mismatchedPath = journalPath(root, requestedMissionId);
  await writeFile(mismatchedPath, bytes);
  const result = run(root, ["mission", "status", "--mission-id", requestedMissionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mission_mismatch/u);
  assert.equal(await readFile(mismatchedPath, "utf8"), bytes);
});

test("packed CLI report rejects a legacy journal stored for another mission", async () => {
  const { root, brief } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const bytes = await readFile(journalPath(root, brief.missionId), "utf8");
  const requestedMissionId = "mission:cli-alias";
  const mismatchedPath = journalPath(root, requestedMissionId);
  await writeFile(mismatchedPath, bytes);
  const result = run(root, ["mission", "report", "--mission-id", requestedMissionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mission_mismatch/u);
  assert.equal(await readFile(mismatchedPath, "utf8"), bytes);
});

test("packed CLI rejects malformed profile-aware JSON without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const malformed = `${JSON.stringify(entry)}\n{not-json}\n`;
  await writeFile(journalPath, malformed);
  const result = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /recovery_required/u);
  assert.equal(await readFile(journalPath, "utf8"), malformed);
});

test("unsigned, tampered, stale-revision, and wrong-sequence evidence writes nothing", async () => {
  const { root, brief, coulson } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  const projection = JSON.parse(begun.stdout).projection;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
  const before = await readFile(journalPath, "utf8");
  const cases = [];

  const unsigned = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  unsigned.signatureBase64 = "";
  cases.push(unsigned);
  const tampered = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  tampered.payload.sourceRef = "fixture-signature:tampered";
  cases.push(tampered);
  const stale = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  stale.payload.revisionId = "sha256:stale";
  stale.signatureBase64 = sign(null, Buffer.from(canonicalJson(stale.payload)), coulson.privateKey).toString("base64");
  cases.push(stale);
  cases.push(signedEvidence(coulson, projection, requirement, "approved", 2, "2020-01-01T00:01:00Z"));

  for (let index = 0; index < cases.length; index += 1) {
    const path = await writeEvidence(root, `invalid-${index}.json`, cases[index]);
    const result = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", path, "--json"]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(await readFile(journalPath, "utf8"), before);
  }
});

test("pause, resume, and cancel are signed append-only governance commands", async () => {
  const { root, brief, coulson } = await fixture();
  let projection = JSON.parse(run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]).stdout).projection;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  for (const [command, decision, sequence, timestamp, extra] of [
    ["approve", "approved", 1, "2020-01-01T00:01:00Z", []],
    ["pause", "paused", 2, "2020-01-01T00:02:00Z", []],
    ["resume", "resumed", 3, "2020-01-01T00:03:00Z", ["--resume-state", "approved"]],
    ["cancel", "cancelled", 4, "2020-01-01T00:04:00Z", []],
  ]) {
    const path = await writeEvidence(root, `${command}.json`, signedEvidence(coulson, projection, requirement, decision, sequence, timestamp));
    if (command === "resume") {
      const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
      const beforeMismatchedResume = await readFile(journalPath, "utf8");
      const mismatched = run(root, ["mission", "resume", "--mission-id", brief.missionId, "--evidence", path, "--resume-state", "proposed", "--json"]);
      assert.equal(mismatched.status, 1, mismatched.stderr);
      assert.match(mismatched.stderr, /decision_mismatch/);
      assert.equal(await readFile(journalPath, "utf8"), beforeMismatchedResume);
    }
    const result = run(root, ["mission", command, "--mission-id", brief.missionId, "--evidence", path, ...extra, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    projection = JSON.parse(result.stdout);
  }
  assert.equal(projection.governance.state, "cancelled");
  const blocked = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(blocked.status, 1);
});

test("conditional Simmons is waiting only when declared by the immutable brief", async () => {
  const { root, brief } = await fixture(true);
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const projection = JSON.parse(begun.stdout).projection;
  assert.deepEqual(projection.readiness.accept.requirementStatuses.map(({ requiredSeatId }) => requiredSeatId), ["fitz", "simmons"]);
  assert.equal(projection.requirements.filter(({ requiredSeatId }) => requiredSeatId === "simmons").length, 1);
  assert.equal(projection.missionId, brief.missionId);
});

test("readInteractivePasscode resolves interactive input and preserves setup lifecycle", async () => {
  const fixture = createInteractivePromptFixture();
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("dummy-passcode\n"));
  assert.equal(await attempt, "dummy-passcode");
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
  assert.equal(fixture.output.some((chunk) => chunk === "dummy-passcode"), false);
});

test("readInteractivePasscode handles cancellation and empty input", async () => {
  const cancelled = createInteractivePromptFixture();
  const cancellation = readInteractivePasscode(cancelled.inputStream, cancelled.outputStream);
  cancelled.inputStream.emitData(Buffer.from([3]));
  await assert.rejects(cancellation, /Passcode prompt cancelled\./u);
  assert.equal(cancelled.calls.on, 1);
  assert.equal(cancelled.calls.off, 1);
  assert.equal(cancelled.calls.setRawMode, 2);
  assert.equal(cancelled.calls.resume, 1);
  assert.equal(cancelled.calls.pause, 1);
  assert.equal(cancelled.output.join(""), "Passcode: \n");

  const empty = createInteractivePromptFixture();
  const emptyAttempt = readInteractivePasscode(empty.inputStream, empty.outputStream);
  empty.inputStream.emitData(Buffer.from("\n"));
  await assert.rejects(emptyAttempt, /Passcode input was empty\./u);
  assert.equal(empty.calls.on, 1);
  assert.equal(empty.calls.off, 1);
  assert.equal(empty.calls.setRawMode, 2);
  assert.equal(empty.calls.resume, 1);
  assert.equal(empty.calls.pause, 1);
  assert.equal(empty.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode resolves once and ignores post-settlement data for CRLF", async () => {
  const fixture = createInteractivePromptFixture();
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("ready\r\nignored"));
  assert.equal(await attempt, "ready");
  fixture.inputStream.emitData(Buffer.from("and-more"));
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode prefers setup failures over interactive outcomes", async () => {
  const fixture = createInteractivePromptFixture({
    syncData: Buffer.from("interactive-passcode\n"),
    failResume: true,
  });
  await assert.rejects(readInteractivePasscode(fixture.inputStream, fixture.outputStream), new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode fails if raw-mode enablement fails", async () => {
  const fixture = createInteractivePromptFixture({ failSetRawMode: true });
  await assert.rejects(readInteractivePasscode(fixture.inputStream, fixture.outputStream), new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 0);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 0);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.calls.write, 2);
});

test("readInteractivePasscode fails if listener registration fails", async () => {
  const fixture = createInteractivePromptFixture({ failOnDataRegistration: true });
  await assert.rejects(readInteractivePasscode(fixture.inputStream, fixture.outputStream), new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 0);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if resume fails", async () => {
  const fixture = createInteractivePromptFixture({ failResume: true });
  await assert.rejects(readInteractivePasscode(fixture.inputStream, fixture.outputStream), new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if listener removal fails and still tears down", async () => {
  const fixture = createInteractivePromptFixture({ failOff: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode fails if raw-mode restoration fails", async () => {
  const fixture = createInteractivePromptFixture({ failSetRawModeRestore: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if pause fails", async () => {
  const fixture = createInteractivePromptFixture({ failPause: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if newline fails", async () => {
  const fixture = createInteractivePromptFixture({ failNewline: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
});

test("passcode signer setup is one-time host setup and authorize appends Coulson approval", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const setupOutput = JSON.parse(setup.stdout);
  assert.match(setupOutput.signerPath, /\/\.shield\/signers\//);
  assert.match(setupOutput.signingKeyRef, /^ed25519:sha256:/);

  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.governance.state, "proposed");

  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 0, authorized.stderr);
  projection = JSON.parse(authorized.stdout);
  assert.equal(projection.governance.state, "approved");
  assert.equal(projection.authorization.state, "authorized");
  assert.equal(projection.evidence[0].sourceRef, `passcode-signer:${brief.missionId}`);
});

test("passcode authorization persists durable approval entry and rejects retries", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 0, authorized.stderr);

  const journalEntries = await readJournalEntries(root, brief.missionId);
  const governanceApprovals = journalEntries.filter(({ type, payload }) => type === "governance.decided" && payload.decision === "approve");
  assert.equal(governanceApprovals.length, 1);
  const governanceEvidence = governanceApprovals[0].payload.evidence;
  assert.equal(governanceEvidence.evidenceKind, "mission_authorization");
  assert.equal(governanceEvidence.seatId, "coulson");
  assert.equal(governanceEvidence.revisionId, brief.revisionId);
  assert.equal(governanceApprovals[0].payload.evidence.sourceRef, `passcode-signer:${brief.missionId}`);

  const journalBytes = await readFile(journalPath(root, brief.missionId), "utf8");
  const retry = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /Current mission has no pending Coulson authorization requirement/u);
  const retryBytes = await readFile(journalPath(root, brief.missionId), "utf8");
  assert.equal(retryBytes, journalBytes);
  const retryEntries = await readJournalEntries(root, brief.missionId);
  const retryApprovals = retryEntries.filter(({ type, payload }) => type === "governance.decided" && payload.decision === "approve");
  assert.equal(retryApprovals.length, 1);
});

test("authorize explains when the local signer has not been provisioned", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);

  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 1);
  assert.match(
    authorized.stderr,
    /No local Coulson signer was found for this mission binding/,
  );
  assert.match(
    authorized.stderr,
    /shield mission signer setup --seat coulson/,
  );
});

test("Wheels Off grants, delegates begin deterministically, reports source, and invalidates fail closed", async () => {
  const { root, brief, coulson } = await fixture();
  const grant = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:cli", previousRevisionId: null, repositoryId: "RanSolo/fixture", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, issuedAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const envelope = { payload: grant, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(grant)), coulson.privateKey).toString("base64") };
  await writeEvidence(root, "delegation.json", envelope);
  const granted = run(root, ["delegation", "grant", "--evidence", "delegation.json", "--json"]);
  assert.equal(granted.status, 0, granted.stderr);
  const eligibility = createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:cli", missionId: brief.missionId, missionRevisionId: brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: "RanSolo/fixture", issueId: "issue:39", issueRevisionId: "sha256:issue39", issueSourceRef: "github:issue:39", scopeItems: ["Bounded Wheels Off implementation"], acceptanceChecks: ["Delegated begin is replayable"], dependencies: [], architecturalDecisions: [], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false });
  await writeFile(join(root, "eligibility.json"), `${JSON.stringify(eligibility, null, 2)}\n`);
  const begun = run(root, ["mission", "begin", "--authorization", "delegated", "--brief", "mission-brief.json", "--delegation", grant.revisionId, "--eligibility", "eligibility.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.journalSchemaVersion, 3); assert.equal(projection.governance.state, "approved"); assert.equal(projection.authorization.source, "delegated"); assert.equal(projection.authorization.state, "authorized"); assert.equal(projection.evidence.length, 0);
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]); assert.equal(report.status, 0, report.stderr); assert.equal(JSON.parse(report.stdout).entries.length, 2);
  const invalidated = run(root, ["mission", "invalidate", "--mission-id", brief.missionId, "--reason", "scope_changed", "--json"]); assert.equal(invalidated.status, 0, invalidated.stderr);
  projection = JSON.parse(invalidated.stdout); assert.equal(projection.governance.state, "proposed"); assert.equal(projection.authorization.state, "invalidated");
  const blocked = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]); assert.equal(blocked.status, 1);
});

test("revoked delegation begins ineligible and falls back to signed supervised approval", async () => {
  const { root, brief, coulson } = await fixture();
  const grant = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:revoked", previousRevisionId: null, repositoryId: "RanSolo/fixture", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, issuedAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const grantEnvelope = { payload: grant, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(grant)), coulson.privateKey).toString("base64") }; await writeEvidence(root, "grant.json", grantEnvelope);
  assert.equal(run(root, ["delegation", "grant", "--evidence", "grant.json", "--json"]).status, 0);
  const revocation = { schemaVersion: 1, revocationId: "revocation:cli", delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, reason: "maintainer_requested", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, revokedAt: { value: "2020-01-01T00:01:00Z", provenance: "humanRecorded" }, logSequence: 1 };
  const revokeEnvelope = { payload: revocation, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(revocation)), coulson.privateKey).toString("base64") }; await writeEvidence(root, "revoke.json", revokeEnvelope);
  const revoked = run(root, ["delegation", "revoke", "--evidence", "revoke.json", "--json"]); assert.equal(revoked.status, 0, revoked.stderr);
  const eligibility = createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:revoked", missionId: brief.missionId, missionRevisionId: brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, issueId: "issue:39", issueRevisionId: "sha256:issue39", issueSourceRef: "github:issue:39", scopeItems: ["Bounded work"], acceptanceChecks: ["Fail closed"], dependencies: [], architecturalDecisions: [], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false }); await writeFile(join(root, "eligibility.json"), `${JSON.stringify(eligibility)}\n`);
  const begun = run(root, ["mission", "begin", "--authorization", "delegated", "--brief", "mission-brief.json", "--delegation", grant.revisionId, "--eligibility", "eligibility.json", "--json"]);
  assert.equal(begun.status, 1, begun.stderr); let projection = JSON.parse(begun.stdout).projection; assert.equal(projection.authorization.state, "ineligible"); assert.ok(projection.authorization.reasons.includes("delegation_revoked"));
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]); assert.equal(report.status, 0, report.stderr);
  const evaluatedAt = JSON.parse(report.stdout).entries[1].timestamp.value;
  const approvalAt = new Date(Date.parse(evaluatedAt) + 1_000).toISOString();
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"); const approval = signedEvidence(coulson, projection, requirement, "approved", 2, approvalAt); await writeEvidence(root, "approval.json", approval);
  const approved = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", "approval.json", "--json"]); assert.equal(approved.status, 0, approved.stderr); projection = JSON.parse(approved.stdout); assert.equal(projection.authorization.source, "supervised"); assert.equal(projection.governance.state, "approved");
});
