import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { readMissionJournalForDisplay, journalByteSha256 } from "../dist/mission-store.mjs";
import { validateAuthorizeWheelsUpInput, executeAuthorizeWheelsUpV1 } from "../dist/authorize-wheels-up-executor-v1.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import { MISSION_130_JOURNAL_DIGEST, createProfileAwareMissionBegunEntry, createProfileAwareMissionBrief, replayProfileAwareMissionJournal } from "../dist/profile-aware-mission-v1.mjs";

const CONFIG_PATH = ".shield/config.json";
const BINDINGS_PATH = ".shield/trusted-human-bindings.json";

function runGit(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  }).trim();
}

function journalPath(root, missionId) {
  return join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
}

function authority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId: `human:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

async function executorFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "shield-wheels-up-executor-v1-"));
  await writeFile(join(root, "package.json"), `{"private":true}\n`);
  await mkdir(join(root, ".shield"));
  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    repositoryTrustProfileId: "signed_human_gates",
    coulsonBindingRef: coulson.binding.signingKeyRef,
    fitzBindingRef: fitz.binding.signingKeyRef,
  });
  await writeFile(join(root, CONFIG_PATH), formatShieldConfig(config));
  await writeFile(join(root, BINDINGS_PATH), `${JSON.stringify({
    schemaVersion: 1,
    bindings: [coulson.binding, fitz.binding],
  }, null, 2)}\n`);
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");

  const missionId = options.missionId ?? "mission:authorize-wheels-up-executor";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Executor-focused test coverage for Wheels Up authorization.",
    subjectId: "issue:999",
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
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-11T12:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...briefContent } = brief;
  await writeFile(join(root, "mission-brief.json"), `${JSON.stringify(briefContent, null, 2)}\n`);

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Executor Fixture"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  runGit(root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(root, ["commit", "-qm", "wheels-up executor base"]);
  const baseRevision = runGit(root, ["rev-parse", "HEAD"]);
  const publicationPaths = [...new Set(options.publicationPaths ?? ["implementation.md"])];
  for (const path of publicationPaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `executor fixture baseline content for ${path}\n`);
  }
  runGit(root, ["add", "--", ...publicationPaths]);
  runGit(root, ["commit", "-qm", "wheels-up executor head"]);
  const headRevision = runGit(root, ["rev-parse", "HEAD"]);

  const began = createProfileAwareMissionBegunEntry(brief, [coulson.binding, fitz.binding]);
  const path = journalPath(root, missionId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(began)}\n`);

  const intent = validateAuthorizeWheelsUpInput({
    baseRevision,
    modelId: "model:bounded",
    approvedRelativePaths: ["implementation.md"],
    approvedActionIds: ["implementation.review"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:bounded-implementation"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:test"],
    reasoningRuntimeId: "runtime:bounded",
    toolExecutorId: "executor:bounded",
    publicationPaths,
  });
  const currentResult = await readMissionJournalForDisplay({ repositoryRoot: root, configuredJournalPath: config.paths.journals, missionId });
  if (currentResult.state === "invalid") {
    throw new Error(`${currentResult.code}: ${currentResult.errors.join(" ")}`);
  }
  const current = currentResult.value;
  const currentBytes = await readFile(path, "utf8");
  const startingJournalSha256 = journalByteSha256(currentBytes);
  return {
    root,
    config,
    missionId,
    path,
    current,
    intent,
    publicationPaths,
    currentBytes,
    startingJournalSha256,
    baseRevision,
    headRevision,
    binding: coulson.binding,
    signerPrivateKey: coulson.privateKey,
  };
}

test("executeAuthorizeWheelsUpV1 runs the four-entry append with one dependency call per stage", async () => {
  const fixture = await executorFixture();
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  let signerPayloadCount = 0;
  let signatureCount = 0;
  const result = await executeAuthorizeWheelsUpV1({
    root: fixture.root,
    config: fixture.config,
    missionId: fixture.missionId,
    intent: fixture.intent,
    timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
    humanMode: false,
    promptOutput: { write: () => {} },
    dependencies: {
      renderDecision: () => {
        calls.render += 1;
        return "{}";
      },
      readPasscode: async () => {
        calls.readPasscode += 1;
        return "passcode";
      },
      signBatch: async (binding, _passcode, payloads) => {
        calls.sign += 1;
        signerPayloadCount = payloads.length;
        const signatures = payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.signerPrivateKey).toString("base64"));
        signatureCount = signatures.length;
        return signatures;
      },
      appendBatchAtomic: async (input) => {
        calls.append += 1;
        assert.equal(input.expectedStartingJournalSha256, fixture.startingJournalSha256);
        assert.deepEqual(
          input.entries.map((entry, index) => ({ type: entry.type, sequence: entry.sequence })),
          [
            { type: "governance.decided", sequence: fixture.current.projection.lastSequence + 1 },
            { type: "implementation.authorized", sequence: fixture.current.projection.lastSequence + 2 },
            { type: "runtime.binding_recorded", sequence: fixture.current.projection.lastSequence + 3 },
            { type: "review.publication_authorized", sequence: fixture.current.projection.lastSequence + 4 },
          ],
        );
        const replay = replayProfileAwareMissionJournal([...fixture.current.entries, ...input.entries]);
        assert.equal(replay.state, "valid");
        return {
          state: "valid",
          value: {
            projection: replay.value,
            journalPath: fixture.path,
            startingSequence: 0,
            endingSequence: 4,
            startingJournalSha256: fixture.startingJournalSha256,
            finalJournalSha256: fixture.startingJournalSha256,
          },
        };
      },
    },
  });

  assert.equal(result, 0);
  assert.equal(calls.render, 1);
  assert.equal(calls.readPasscode, 1);
  assert.equal(calls.sign, 1);
  assert.equal(calls.append, 1);
  assert.equal(signerPayloadCount, 4);
  assert.equal(signatureCount, 4);
});

test("executeAuthorizeWheelsUpV1 blocks closed paths before reaching dependencies", async () => {
  const fixture = await executorFixture({ publicationPaths: ["implementation.md"] });
  const mismatched = { ...fixture.intent, publicationPaths: ["untracked-change.md"] };
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  await assert.rejects(
    () =>
      executeAuthorizeWheelsUpV1({
        root: fixture.root,
        config: fixture.config,
        missionId: fixture.missionId,
        intent: mismatched,
        timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
        humanMode: false,
        promptOutput: { write: () => {} },
        dependencies: {
          renderDecision: () => {
            calls.render += 1;
            return "{}";
          },
          readPasscode: async () => {
            calls.readPasscode += 1;
            return "passcode";
          },
          signBatch: async () => {
            calls.sign += 1;
            return [];
          },
          appendBatchAtomic: async () => {
            calls.append += 1;
            return { state: "valid", value: null };
          },
        },
      }),
    /must exactly equal the observed base-to-HEAD change set/u,
  );
  assert.deepEqual(calls, { render: 0, readPasscode: 0, sign: 0, append: 0 });
});

test("executeAuthorizeWheelsUpV1 handles cancellation after manifest rendering without signing or appending", async () => {
  const fixture = await executorFixture();
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  await assert.rejects(
    () =>
      executeAuthorizeWheelsUpV1({
        root: fixture.root,
        config: fixture.config,
        missionId: fixture.missionId,
        intent: fixture.intent,
        timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
        humanMode: true,
        promptOutput: { write: () => {} },
        dependencies: {
          renderDecision: () => {
            calls.render += 1;
            return "manifest";
          },
          readPasscode: async () => {
            calls.readPasscode += 1;
            throw new Error("passcode prompt cancelled");
          },
          signBatch: async () => {
            calls.sign += 1;
            return [];
          },
          appendBatchAtomic: async () => {
            calls.append += 1;
            return { state: "valid", value: null };
          },
        },
      }),
    /passcode prompt cancelled/u,
  );
  assert.equal(calls.render, 1);
  assert.equal(calls.readPasscode, 1);
  assert.equal(calls.sign, 0);
  assert.equal(calls.append, 0);
});

test("executeAuthorizeWheelsUpV1 rejects stale state after signing and avoids append", async () => {
  const fixture = await executorFixture();
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  await assert.rejects(
    () =>
      executeAuthorizeWheelsUpV1({
        root: fixture.root,
        config: fixture.config,
        missionId: fixture.missionId,
        intent: fixture.intent,
        timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
        humanMode: false,
        promptOutput: { write: () => {} },
        dependencies: {
          renderDecision: () => {
            calls.render += 1;
            return "{}";
          },
          readPasscode: async () => {
            calls.readPasscode += 1;
            return "passcode";
          },
          signBatch: async (_binding, _passcode, payloads) => {
            calls.sign += 1;
            await writeFile(
              join(fixture.root, ".shield", "config.json"),
              `${formatShieldConfig({
                ...fixture.config,
                paths: { ...fixture.config.paths, temp: ".shield/tmp-stale" },
              })}\n`,
            );
            return payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.signerPrivateKey).toString("base64"));
          },
          appendBatchAtomic: async () => {
            calls.append += 1;
            return { state: "valid", value: null };
          },
        },
      }),
    /Authorize Wheels Up requires an exactly clean workspace|inputs, manifest, repository, or mission journal changed after display|Repository origin does not match configured repository identity/u,
  );
  assert.equal(calls.render, 1);
  assert.equal(calls.readPasscode, 1);
  assert.equal(calls.sign, 1);
  assert.equal(calls.append, 0);
});

test("executeAuthorizeWheelsUpV1 propagates append uncertainty", async () => {
  const fixture = await executorFixture();
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  await assert.rejects(
    () =>
      executeAuthorizeWheelsUpV1({
        root: fixture.root,
        config: fixture.config,
        missionId: fixture.missionId,
        intent: fixture.intent,
        timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
        humanMode: false,
        promptOutput: { write: () => {} },
        dependencies: {
          renderDecision: () => {
            calls.render += 1;
            return "{}";
          },
          readPasscode: async () => {
            calls.readPasscode += 1;
            return "passcode";
          },
          signBatch: async (binding, _passcode, payloads) => {
            calls.sign += 1;
            return payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.signerPrivateKey).toString("base64"));
          },
          appendBatchAtomic: async () => {
            calls.append += 1;
            return { state: "invalid", code: "append_uncertain", errors: ["append_uncertain"] };
          },
        },
      }),
    /append_uncertain/u,
  );
  assert.equal(calls.render, 1);
  assert.equal(calls.readPasscode, 1);
  assert.equal(calls.sign, 1);
  assert.equal(calls.append, 1);
});

test("executeAuthorizeWheelsUpV1 rejects stale config after signing and avoids append", async () => {
  const fixture = await executorFixture();
  const calls = { render: 0, readPasscode: 0, sign: 0, append: 0 };
  await assert.rejects(
    () =>
      executeAuthorizeWheelsUpV1({
        root: fixture.root,
        config: fixture.config,
        missionId: fixture.missionId,
        intent: fixture.intent,
        timestamp: { value: "2026-08-11T12:01:00Z", provenance: "hostTrusted" },
        humanMode: false,
        promptOutput: { write: () => {} },
        dependencies: {
          renderDecision: () => {
            calls.render += 1;
            return "{}";
          },
          readPasscode: async () => {
            calls.readPasscode += 1;
            return "passcode";
          },
          signBatch: async (_binding, _passcode, payloads) => {
            calls.sign += 1;
            await new Promise((resolve) => {
              setTimeout(() => {
                resolve();
              }, 1);
            });
            await writeFile(
              join(fixture.root, ".shield", "config.json"),
              `${formatShieldConfig({
                ...fixture.config,
                paths: { ...fixture.config.paths, temp: ".shield/tmp-stale" },
              })}\n`,
            );
            return payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), fixture.signerPrivateKey).toString("base64"));
          },
          appendBatchAtomic: async () => {
            calls.append += 1;
            return { state: "valid", value: null };
          },
        },
      }),
    /Authorize Wheels Up requires an exactly clean workspace|inputs, manifest, repository, or mission journal changed after display|Repository origin does not match configured repository identity/u,
  );
  assert.equal(calls.render, 1);
  assert.equal(calls.readPasscode, 1);
  assert.equal(calls.sign, 1);
  assert.equal(calls.append, 0);
});
