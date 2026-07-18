import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createSupervisedMissionBrief,
} from "../dist/mission-v2.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");

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
    subjectId: "mission-plan:cli",
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

function run(root, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}

function signedEvidence(authorityRecord, projection, requirement, decision, sequence, timestamp) {
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
