import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FEATURE_FLIGHT_NEXT_ACTION,
  FEATURE_FLIGHT_RECOVERY_NOTICE,
  FEATURE_FLIGHT_REMOTE_NOTICE,
  FEATURE_FLIGHT_TERMINAL_NOTICE,
  canonicalFeatureFlightBytes,
  featureFlightContract,
  featureFlightPayload,
  featureFlightRemoteChallenge,
  normalizeFeatureFlightRemoteUrl,
  validateFeatureFlightRecovery,
  validateFeatureFlightRemoteObservation,
  validateFeatureFlightRemoteObserverDescriptor,
  validateFeatureFlightTerminal,
} from "../scripts/operations/feature-flight-recovery.mjs";

const DIGEST = "a".repeat(64);
const REVISION = "4".repeat(40);
const descriptor = () => Object.freeze({
  observerId: "shield.feature-flight.remote-observer", observerVersion: "1.0.0", capabilityClass: "remote_branch_read_only",
  runtimeId: "runtime:observer", executorId: "executor:remote-read", remoteName: "origin",
  urlNormalization: "shield-git-remote-url-v1", repositoryRoot: "/repo/worktree", commonGitDirectory: "/repo/.git",
  commonGitDevice: 12, commonGitInode: 34, configuredRemoteUrl: "git@github.com:RanSolo/shield-workspace.git",
  remoteUrlIdentity: "ssh://git@github.com/RanSolo/shield-workspace",
});
const observation = (trusted = descriptor(), overrides = {}) => {
  const phase = overrides.phase ?? "pre_claim"; const fullRef = "refs/heads/agent/daisy-251";
  const challenge = featureFlightRemoteChallenge(DIGEST, trusted, fullRef, phase);
  return {
    schemaVersion: 1, artifactType: "feature-flight-remote-observation", contractVersion: "2.0.0", authority: "none",
    notice: FEATURE_FLIGHT_REMOTE_NOTICE, repositoryRoot: trusted.repositoryRoot, commonGitDirectory: trusted.commonGitDirectory,
    commonGitDevice: trusted.commonGitDevice, commonGitInode: trusted.commonGitInode,
    observer: { observerId: trusted.observerId, observerVersion: trusted.observerVersion, runtimeId: trusted.runtimeId, executorId: trusted.executorId },
    remoteName: "origin", remoteUrlIdentity: trusted.remoteUrlIdentity, fullRef, remoteHead: REVISION,
    observedAt: phase === "pre_claim" ? "2026-08-09T12:59:59.000Z" : "2026-08-09T13:00:00.500Z",
    phase, challenge, ...overrides,
  };
};
const artifact = (name) => ({ path: `/store/effects/${DIGEST}/${name}.json`, bytes: 10, sha256: DIGEST });
const hierarchy = {
  root: { path: "/store", dev: 1, ino: 1 }, effects: { path: "/store/effects", dev: 1, ino: 2 },
  effect: { path: `/store/effects/${DIGEST}`, dev: 1, ino: 3 },
};

test("S3-R1: shield-git-remote-url-v1 collapses equivalent SCP/SSH and rejects credentials, ambiguity, and alternate schemes", () => {
  assert.equal(normalizeFeatureFlightRemoteUrl("git@github.com:RanSolo/shield-workspace.git"), "ssh://git@github.com/RanSolo/shield-workspace");
  assert.equal(normalizeFeatureFlightRemoteUrl("ssh://git@github.com/RanSolo/shield-workspace.git"), "ssh://git@github.com/RanSolo/shield-workspace");
  for (const hostile of [
    "https://github.com/RanSolo/shield-workspace.git", "ssh://user:secret@github.com/RanSolo/shield-workspace.git",
    "git@github.com:RanSolo/shield-workspace.git?token=x", "git@github.com:RanSolo/../shield-workspace.git",
    "git@github.com:RanSolo/shield-workspace/extra.git", "git@github.com:RanSolo/shield-workspace.git\u0000",
  ]) assert.throws(() => normalizeFeatureFlightRemoteUrl(hostile));
});

test("S3-R1: descriptor and observation reject hostile object surfaces and every identity substitution", async (t) => {
  const trusted = descriptor(); assert.deepEqual(validateFeatureFlightRemoteObserverDescriptor(trusted), trusted);
  const baseline = observation(trusted);
  assert.equal(validateFeatureFlightRemoteObservation(baseline, { descriptor: trusted, fullRef: baseline.fullRef, phase: baseline.phase, challenge: baseline.challenge }).remoteHead, REVISION);
  const substitutions = [
    ["root", { repositoryRoot: "/repo/other" }], ["common git", { commonGitDirectory: "/repo/other.git" }],
    ["device", { commonGitDevice: 99 }], ["inode", { commonGitInode: 99 }], ["remote", { remoteName: "upstream" }],
    ["url", { remoteUrlIdentity: "ssh://git@github.com/Other/repository" }], ["ref", { fullRef: "refs/heads/main" }],
    ["observer", { observer: { ...baseline.observer, executorId: "executor:substituted" } }],
    ["phase", { phase: "post_adapter" }], ["challenge", { challenge: "b".repeat(64) }],
  ];
  for (const [name, override] of substitutions) await t.test(name, () => assert.throws(() => validateFeatureFlightRemoteObservation(
    { ...baseline, ...override }, { descriptor: trusted, fullRef: baseline.fullRef, phase: "pre_claim", challenge: baseline.challenge },
  )));
  await t.test("unknown", () => assert.throws(() => validateFeatureFlightRemoteObservation({ ...baseline, fetch: true }, {
    descriptor: trusted, fullRef: baseline.fullRef, phase: "pre_claim", challenge: baseline.challenge,
  })));
  await t.test("proxy", () => assert.throws(() => validateFeatureFlightRemoteObservation(new Proxy(baseline, {}), {
    descriptor: trusted, fullRef: baseline.fullRef, phase: "pre_claim", challenge: baseline.challenge,
  })));
  await t.test("accessor", () => {
    const hostile = { ...baseline }; Object.defineProperty(hostile, "remoteHead", { enumerable: true, get: () => REVISION });
    assert.throws(() => validateFeatureFlightRemoteObservation(hostile, { descriptor: trusted, fullRef: baseline.fullRef, phase: "pre_claim", challenge: baseline.challenge }));
  });
});

test("S3-R5/R6: terminal winner embeds complete canonical payload identities and enforces one terminal kind", () => {
  const successValue = { success: true }; const resultValue = { result: true };
  const success = {
    schemaVersion: 1, artifactType: "feature-flight-step-terminal", authority: "none", notice: FEATURE_FLIGHT_TERMINAL_NOTICE,
    contract: featureFlightContract(), effectClaimId: DIGEST, attemptDigest: DIGEST, claim: artifact("claim"), terminalKind: "success",
    successor: featureFlightPayload(successValue), result: featureFlightPayload(resultValue), recovery: null,
    hierarchyIdentity: hierarchy, recordedAt: "2026-08-09T13:00:01.000Z",
  };
  assert.deepEqual(validateFeatureFlightTerminal(success), []);
  assert.equal(success.successor.bytes, canonicalFeatureFlightBytes(successValue).length);
  assert.notDeepEqual(validateFeatureFlightTerminal({ ...success, recovery: featureFlightPayload({ bad: true }) }), []);
  assert.notDeepEqual(validateFeatureFlightTerminal({ ...success, successor: { ...success.successor, bytes: success.successor.bytes + 1 } }), []);
});

test("S3-R5/R6/R10: recovery receipt has closed reason mapping, null successor, and inspection-only next action", () => {
  const trusted = descriptor(); const baseline = observation(trusted); const latest = observation(trusted, { phase: "post_adapter", remoteHead: "6".repeat(40) });
  const recovery = {
    schemaVersion: 1, artifactType: "feature-flight-step-recovery", authority: "none", notice: FEATURE_FLIGHT_RECOVERY_NOTICE,
    contract: featureFlightContract(), effectClaimId: DIGEST, attemptDigest: DIGEST, claim: artifact("claim"), successor: null,
    reason: "remote_drift", phase: "remote_postcheck", baselineRemoteObservation: baseline, latestRemoteObservation: latest,
    invocationClassification: "one_completed", effectState: "uncertain_do_not_reinvoke", gateEligible: false,
    recordedAt: "2026-08-09T13:00:01.000Z", nextAction: FEATURE_FLIGHT_NEXT_ACTION,
  };
  assert.deepEqual(validateFeatureFlightRecovery(recovery), []);
  for (const mutation of [
    { phase: "adapter" }, { invocationClassification: "zero_or_unknown" }, { successor: artifact("successor") },
    { nextAction: "git reset --hard" }, { authority: "approved" }, { reason: "take_over_and_retry" },
  ]) assert.notDeepEqual(validateFeatureFlightRecovery({ ...recovery, ...mutation }), []);
});

test("S3-R9: production Slice 3 core has no process spawning, Git command, fetch, or GitHub mutation API", async () => {
  const sources = await Promise.all([
    "../scripts/operations/feature-flight-step.mjs", "../scripts/operations/feature-flight-step-store.mjs",
    "../scripts/operations/feature-flight-recovery.mjs",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /node:child_process|execFile|spawn\s*\(|octokit|githubApi|git\s+(?:fetch|push|reset|merge|rebase)/u);
});
