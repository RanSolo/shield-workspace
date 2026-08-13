import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import { canonicalJson } from "../dist/mission-v2.mjs";
import {
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import { appendProfileAwareMissionEntriesAtomicV1, journalByteSha256 } from "../dist/mission-store.mjs";
import { signerTestOnly } from "../dist/mission-signer.mjs";
import {
  executeReviewPublicationAuthorizationV1,
  projectPreparedReviewPublicationSemanticTupleV1,
} from "../dist/review-publication-executor-v1.mjs";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  }).trim();
}

async function legacyFixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-publication-executor-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-publication-signer-"));
  const missionId = "mission:publication-executor";
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = await signerTestOnly.createSigner(
    { seatId: "coulson", bindingId: "binding:coulson", humanPrincipalId: "human:coulson" },
    "publication-passcode",
    { homeDirectory: homeRoot, generateKeyPair: () => ({ privateKey, publicKey }) },
  );
  const binding = {
    schemaVersion: 1,
    bindingId: "binding:coulson",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: signer.signingKeyRef,
    publicKeySpkiBase64: signer.publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    repositoryTrustProfileId: "coulson_only_platform_review",
    coulsonBindingRef: binding.signingKeyRef,
  });
  await mkdir(join(root, ".shield", "journals"), { recursive: true });
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n");
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "shield@example.invalid"]);
  git(root, ["config", "user.name", "SHIELD Fixture"]);
  git(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  git(root, ["add", "package.json", ".shield/config.json", ".shield/.gitignore"]);
  git(root, ["commit", "-qm", "publication base"]);
  const baseRevision = git(root, ["rev-parse", "HEAD"]);
  await writeFile(join(root, "review-artifact.md"), "review publication\n");
  git(root, ["add", "review-artifact.md"]);
  git(root, ["commit", "-qm", "publication head"]);

  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Authorize one bounded review publication.",
    subjectId: "issue:286",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-13T00:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const begun = createProfileAwareMissionBegunEntry(brief, [binding]);
  const begunReplay = replayProfileAwareMissionJournal([begun]);
  assert.equal(begunReplay.state, "valid");
  const requirement = begunReplay.value.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  assert.ok(requirement);
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: `evidence:${missionId}:coulson`,
    requirementId: requirement.requirementId,
    missionId,
    revisionId: brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: binding.humanPrincipalId,
    bindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `authorization:${missionId}`,
    timestamp: { value: "2026-08-13T00:01:00Z", provenance: "humanRecorded" },
    journalSequence: 1,
  };
  const governance = createProfileAwareGovernanceDecisionEntryV1({
    projection: begunReplay.value,
    trustedBindings: [binding],
    evidence: {
      payload: evidencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), privateKey).toString("base64"),
    },
  });
  const journalPath = join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
  await writeFile(journalPath, `${canonicalJson(begun)}\n${canonicalJson(governance)}\n`);
  return {
    root,
    homeRoot,
    missionId,
    binding,
    privateKey,
    baseRevision,
    journalPath,
    intent: {
      baseRevision,
      authorizedPaths: ["review-artifact.md"],
      permittedEffects: ["review.comment.publish"],
    },
  };
}

function dependencies(fixture, calls, overrides = {}) {
  return {
    renderDecision: () => { calls.render += 1; return "unexpected"; },
    readPasscode: async () => { calls.pin += 1; return "unused"; },
    signPayload: async (_binding, _passcode, payload) => {
      calls.sign += 1;
      return sign(null, Buffer.from(canonicalJson(payload)), fixture.privateKey).toString("base64");
    },
    appendEntryAtomic: async (input) => {
      calls.append += 1;
      assert.equal(input.entries.length, 1);
      assert.equal(input.expectedStartingJournalSha256, journalByteSha256(await readFile(fixture.journalPath)));
      return appendProfileAwareMissionEntriesAtomicV1(input);
    },
    ...overrides,
  };
}

test("prepared semantic tuple ignores record identity but closes HEAD, paths, and effects", () => {
  const authority = {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: "authorization:mission:semantic:review-publish:5",
    missionId: "mission:semantic",
    subjectId: "issue:286",
    missionRevisionId: "revision:semantic",
    repositoryId: "RanSolo/fixture",
    canonicalRepositoryRoot: "/fixture",
    branch: "main",
    baseRevisionId: "a".repeat(40),
    headRevisionId: "b".repeat(40),
    authorizedPaths: ["implementation.md"],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
  };
  const tuple = projectPreparedReviewPublicationSemanticTupleV1(authority);
  assert.deepEqual(projectPreparedReviewPublicationSemanticTupleV1({ ...authority, authorityRef: "authorization:other" }), tuple);
  assert.notDeepEqual(projectPreparedReviewPublicationSemanticTupleV1({ ...authority, headRevisionId: "c".repeat(40) }), tuple);
  assert.notDeepEqual(projectPreparedReviewPublicationSemanticTupleV1({ ...authority, authorizedPaths: ["other.md"] }), tuple);
  assert.notDeepEqual(projectPreparedReviewPublicationSemanticTupleV1({ ...authority, permittedEffects: ["review.branch.push"] }), tuple);
  assert.equal(projectPreparedReviewPublicationSemanticTupleV1({ ...authority, authorityKind: "wheels_up" }), null);
});

test("legacy mode preserves identity and display semantics while using one-entry atomic CAS", async () => {
  const fixture = await legacyFixture();
  const previousHome = process.env.HOME;
  process.env.HOME = fixture.homeRoot;
  try {
    const calls = { render: 0, pin: 0, sign: 0, append: 0 };
    const result = await executeReviewPublicationAuthorizationV1({
      mode: "legacy",
      root: fixture.root,
      missionId: fixture.missionId,
      intent: fixture.intent,
      timestamp: { value: "2026-08-13T00:02:00Z", provenance: "hostTrusted" },
      humanMode: false,
      decisionOutput: { write: () => { throw new Error("legacy display widened"); } },
    }, dependencies(fixture, calls));

    assert.deepEqual(calls, { render: 0, pin: 1, sign: 1, append: 1 });
    const record = result.projection.publicationAuthorizations[0];
    assert.equal(record.authority.authorityRef, `authorization:${fixture.missionId}:review-publish:2`);
    assert.equal(record.authorization.authorizationId, record.authority.authorityRef);
    assert.equal(record.authorization.sourceRef, "cli:publication-authorize:2");
    assert.equal(result.journalSequence, 2);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("prepared mode requires exact selected evidence before display, PIN, signing, or append", async () => {
  const fixture = await legacyFixture();
  const previousHome = process.env.HOME;
  process.env.HOME = fixture.homeRoot;
  try {
    const calls = { render: 0, pin: 0, sign: 0, append: 0 };
    await assert.rejects(() => executeReviewPublicationAuthorizationV1({
      mode: "prepared",
      root: fixture.root,
      missionId: fixture.missionId,
      intent: fixture.intent,
      timestamp: { value: "2026-08-13T00:02:00Z", provenance: "hostTrusted" },
      humanMode: false,
      decisionOutput: { write: () => {} },
    }, dependencies(fixture, calls)), /requires exact selected evidence/u);
    assert.deepEqual(calls, { render: 0, pin: 0, sign: 0, append: 0 });
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("post-sign repository drift appends nothing", async () => {
  const fixture = await legacyFixture();
  const previousHome = process.env.HOME;
  process.env.HOME = fixture.homeRoot;
  try {
    const before = await readFile(fixture.journalPath);
    const calls = { render: 0, pin: 0, sign: 0, append: 0 };
    const base = dependencies(fixture, calls);
    await assert.rejects(() => executeReviewPublicationAuthorizationV1({
      mode: "legacy",
      root: fixture.root,
      missionId: fixture.missionId,
      intent: fixture.intent,
      timestamp: { value: "2026-08-13T00:02:00Z", provenance: "hostTrusted" },
      humanMode: false,
      decisionOutput: { write: () => {} },
    }, {
      ...base,
      signPayload: async (binding, passcode, payload) => {
        const signature = await base.signPayload(binding, passcode, payload);
        await writeFile(join(fixture.root, "post-sign-drift.txt"), "drift\n");
        return signature;
      },
    }), /changed while authorization was being signed/u);
    assert.deepEqual(calls, { render: 0, pin: 1, sign: 1, append: 0 });
    assert.deepEqual(await readFile(fixture.journalPath), before);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});
