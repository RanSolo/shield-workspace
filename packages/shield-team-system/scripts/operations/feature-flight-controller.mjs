#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORITY_DERIVED_STATUSES,
  OPERATOR_DISPOSITION_STATUSES,
  SHA256_PATTERN,
  artifactIdentity,
  assertFlightState,
  assertResolvedPlan,
  sameArtifactIdentity,
  validateImmediateTransition,
} from "./flight-contracts.mjs";

export const FEATURE_FLIGHT_CONTROLLER_ID = "shield-feature-flight-controller";
export const FEATURE_FLIGHT_CONTROLLER_VERSION = "1.0.0";
export const FEATURE_FLIGHT_STATUS_NOTICE = "Advisory structural projection only. This status grants no mission or human authority, proves no freshness, and performs no dispatch or external effect.";

const STATUS_USAGE = [
  "Usage:",
  "  shield-ops flight status --plan FILE --expected-plan-sha256 SHA256 --state FILE --expected-state-sha256 SHA256 --expected-state-sequence N [--predecessor-state FILE --expected-predecessor-sha256 SHA256]",
].join("\n");

export class FlightCliArgumentError extends Error {}

const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const defaultSnapshotDependencies = { lstat, open, realpath };

export const readFlightJsonSnapshot = async (suppliedPath, injected = {}) => {
  const dependencies = { ...defaultSnapshotDependencies, ...injected };
  if (typeof suppliedPath !== "string" || suppliedPath.length === 0 || !isAbsolute(suppliedPath) ||
      normalize(suppliedPath) !== suppliedPath || resolve(suppliedPath) !== suppliedPath) {
    throw new Error(`Flight artifact path must be canonical and absolute: ${String(suppliedPath)}`);
  }
  const parent = dirname(suppliedPath);
  const [canonicalParent, canonicalPath] = await Promise.all([
    dependencies.realpath(parent).catch(() => undefined),
    dependencies.realpath(suppliedPath).catch(() => undefined),
  ]);
  if (canonicalParent !== parent || canonicalPath !== suppliedPath) {
    throw new Error(`Flight artifact path must not use symlinks or canonical aliases: ${suppliedPath}`);
  }
  const [parentBefore, pathBefore] = await Promise.all([
    dependencies.lstat(parent).catch(() => undefined),
    dependencies.lstat(suppliedPath).catch(() => undefined),
  ]);
  if (!parentBefore?.isDirectory() || parentBefore.isSymbolicLink() || !pathBefore?.isFile() || pathBefore.isSymbolicLink()) {
    throw new Error(`Flight artifact must be an existing non-symlink regular file: ${suppliedPath}`);
  }

  const handle = await dependencies.open(suppliedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameInode(pathBefore, opened)) throw new Error(`Flight artifact identity changed while opening: ${suppliedPath}`);
    await dependencies.beforeRead?.({ path: suppliedPath, handle });
    const bytes = await handle.readFile();
    await dependencies.afterRead?.({ path: suppliedPath, handle });
    const [retained, parentAfter, pathAfter, canonicalParentAfter, canonicalPathAfter] = await Promise.all([
      handle.stat(),
      dependencies.lstat(parent).catch(() => undefined),
      dependencies.lstat(suppliedPath).catch(() => undefined),
      dependencies.realpath(parent).catch(() => undefined),
      dependencies.realpath(suppliedPath).catch(() => undefined),
    ]);
    if (!retained.isFile() || !sameInode(opened, retained) || retained.size !== bytes.length ||
        !parentAfter?.isDirectory() || parentAfter.isSymbolicLink() || !sameInode(parentBefore, parentAfter) ||
        !pathAfter?.isFile() || pathAfter.isSymbolicLink() || !sameInode(opened, pathAfter) ||
        canonicalParentAfter !== parent || canonicalPathAfter !== suppliedPath) {
      throw new Error(`Flight artifact identity changed during snapshot: ${suppliedPath}`);
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw new Error(`Flight artifact must not begin with a UTF-8 BOM: ${suppliedPath}`);
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Flight artifact is not valid UTF-8: ${suppliedPath}`);
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON in ${suppliedPath}: ${error instanceof Error ? error.message : error}`);
    }
    return { path: suppliedPath, bytes, sha256: sha256(bytes), value };
  } finally {
    await handle.close();
  }
};

const requireDigest = (value, label, ErrorType = Error) => {
  if (!SHA256_PATTERN.test(value ?? "")) throw new ErrorType(`${label} must be a raw lowercase SHA-256 digest.`);
};

const requireSequence = (value, label, ErrorType = Error) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new ErrorType(`${label} must be a non-negative safe integer.`);
};

export const computeFeatureFlightStatus = async ({
  planPath,
  expectedPlanSha256,
  statePath,
  expectedStateSha256,
  expectedStateSequence,
  predecessorStatePath,
  expectedPredecessorSha256,
}, injected = {}) => {
  requireDigest(expectedPlanSha256, "expectedPlanSha256");
  requireDigest(expectedStateSha256, "expectedStateSha256");
  requireSequence(expectedStateSequence, "expectedStateSequence");
  const predecessorFlagsPresent = predecessorStatePath !== undefined || expectedPredecessorSha256 !== undefined;
  if (expectedStateSequence === 0 && predecessorFlagsPresent) throw new Error("Genesis state must not supply predecessor snapshot evidence.");
  if (expectedStateSequence > 0 && (predecessorStatePath === undefined || expectedPredecessorSha256 === undefined)) {
    throw new Error("Non-genesis state requires both predecessor snapshot flags.");
  }
  if (expectedPredecessorSha256 !== undefined) requireDigest(expectedPredecessorSha256, "expectedPredecessorSha256");

  const planSnapshot = await readFlightJsonSnapshot(planPath, injected.snapshot);
  if (planSnapshot.sha256 !== expectedPlanSha256) throw new Error("Expected plan SHA-256 does not match the supplied plan snapshot.");
  const plan = assertResolvedPlan(planSnapshot.value);
  const planArtifact = artifactIdentity(planSnapshot);

  const stateSnapshot = await readFlightJsonSnapshot(statePath, injected.snapshot);
  if (stateSnapshot.sha256 !== expectedStateSha256) throw new Error("Expected state SHA-256 does not match the supplied state snapshot.");
  const state = assertFlightState(plan, planArtifact, stateSnapshot.value);
  if (state.sequence !== expectedStateSequence) {
    throw new Error(`Expected state sequence ${expectedStateSequence} does not match supplied sequence ${state.sequence}.`);
  }

  let predecessorSnapshot = null;
  let predecessor = null;
  if (state.sequence === 0) {
    if (predecessorFlagsPresent) throw new Error("Genesis state must not supply predecessor snapshot evidence.");
  } else {
    if (predecessorStatePath === undefined || expectedPredecessorSha256 === undefined) {
      throw new Error("Non-genesis state requires both predecessor snapshot flags.");
    }
    predecessorSnapshot = await readFlightJsonSnapshot(predecessorStatePath, injected.snapshot);
    if (predecessorSnapshot.sha256 !== expectedPredecessorSha256) throw new Error("Expected predecessor SHA-256 does not match the supplied predecessor snapshot.");
    if (state.predecessorSha256 !== predecessorSnapshot.sha256) throw new Error("Current state predecessorSha256 does not match the supplied predecessor snapshot.");
    predecessor = assertFlightState(plan, planArtifact, predecessorSnapshot.value, "predecessor");
    if (predecessor.flightId !== state.flightId) throw new Error("Predecessor flightId does not match current state.");
    if (!sameArtifactIdentity(predecessor.plan, state.plan)) throw new Error("Predecessor plan identity does not match current state.");
    if (predecessor.sequence !== state.sequence - 1) throw new Error("Predecessor sequence must equal current sequence minus one.");
    const transitionErrors = validateImmediateTransition(plan, predecessor, state);
    if (transitionErrors.length > 0) throw new Error(`Invalid immediate flight-state edge:\n- ${transitionErrors.join("\n- ")}`);
  }

  const snapshotsForAuthority = predecessor === null ? [state] : [state, predecessor];
  const authorityStop = snapshotsForAuthority.some((snapshot) =>
    plan.missions.some((mission) => AUTHORITY_DERIVED_STATUSES.has(snapshot.missions[mission.id].status)));
  const operatorStop = !authorityStop && plan.missions.some((mission) =>
    OPERATOR_DISPOSITION_STATUSES.has(state.missions[mission.id].status));
  let globalStop = authorityStop ? { code: "authority-verification-required" }
    : operatorStop ? { code: "operator-disposition-required" }
      : null;

  let selected = null;
  if (globalStop === null) {
    selected = plan.missions.find((mission) => state.missions[mission.id].status === "planned" &&
      mission.activationWave === state.wave.current && mission.dependsOn.length === 0) ?? null;
    if (selected === null) globalStop = { code: "no-structurally-eligible-candidate" };
  }

  const missions = plan.missions.map((mission) => {
    const record = state.missions[mission.id];
    const unmetDependencies = mission.dependsOn.filter((dependency) => state.missions[dependency].status !== "integrated");
    let disposition = "not-selected";
    if (globalStop?.code === "authority-verification-required" && AUTHORITY_DERIVED_STATUSES.has(record.status)) {
      disposition = "authority-verification-required";
    } else if (globalStop?.code === "operator-disposition-required" && OPERATOR_DISPOSITION_STATUSES.has(record.status)) {
      disposition = "operator-disposition-required";
    } else if (globalStop === null && selected?.id === mission.id) {
      disposition = "candidate";
    } else if ((globalStop === null || globalStop?.code === "no-structurally-eligible-candidate") &&
               record.status === "planned" && mission.dependsOn.length > 0) {
      disposition = "waiting-for-dependencies";
    }
    return {
      id: mission.id,
      lane: record.lane,
      activationWave: record.activationWave,
      status: record.status,
      revision: record.revision,
      unmetDependencies,
      disposition,
    };
  });

  return {
    schemaVersion: 1,
    statusType: "shield-feature-flight-status",
    authority: "none",
    gateEligible: false,
    notice: FEATURE_FLIGHT_STATUS_NOTICE,
    controller: { id: FEATURE_FLIGHT_CONTROLLER_ID, version: FEATURE_FLIGHT_CONTROLLER_VERSION },
    freshness: {
      latestStateProven: false,
      completeHistoryProven: false,
      immediatePredecessorProven: predecessor !== null,
    },
    flightId: plan.flightId,
    sequence: state.sequence,
    currentWave: state.wave.current,
    plan: planArtifact,
    state: artifactIdentity(stateSnapshot),
    predecessor: predecessorSnapshot === null ? null : artifactIdentity(predecessorSnapshot),
    globalStop,
    nextCandidate: selected === null ? null : {
      missionId: selected.id,
      lane: selected.lane,
      activationWave: selected.activationWave,
      action: "request-exact-child-authorization",
    },
    missions,
  };
};

export const parseFlightStatusArguments = (argv) => {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const definitions = new Map([
    ["--plan", "planPath"],
    ["--expected-plan-sha256", "expectedPlanSha256"],
    ["--state", "statePath"],
    ["--expected-state-sha256", "expectedStateSha256"],
    ["--expected-state-sequence", "expectedStateSequence"],
    ["--predecessor-state", "predecessorStatePath"],
    ["--expected-predecessor-sha256", "expectedPredecessorSha256"],
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (typeof flag !== "string" || !flag.startsWith("--")) throw new FlightCliArgumentError(`Unexpected positional argument: ${String(flag)}.`);
    const property = definitions.get(flag);
    if (property === undefined) throw new FlightCliArgumentError(`Unknown option: ${flag}.`);
    if (Object.hasOwn(options, property)) throw new FlightCliArgumentError(`Duplicate option: ${flag}.`);
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) throw new FlightCliArgumentError(`${flag} requires a non-empty value.`);
    options[property] = value;
  }
  for (const [flag, property] of definitions) {
    if (flag.startsWith("--predecessor")) continue;
    if (flag === "--expected-predecessor-sha256") continue;
    if (!Object.hasOwn(options, property)) throw new FlightCliArgumentError(`Missing required option: ${flag}.`);
  }
  if (!/^(?:0|[1-9][0-9]*)$/u.test(options.expectedStateSequence)) {
    throw new FlightCliArgumentError("--expected-state-sequence must be a non-negative integer.");
  }
  options.expectedStateSequence = Number(options.expectedStateSequence);
  requireSequence(options.expectedStateSequence, "--expected-state-sequence", FlightCliArgumentError);
  requireDigest(options.expectedPlanSha256, "--expected-plan-sha256", FlightCliArgumentError);
  requireDigest(options.expectedStateSha256, "--expected-state-sha256", FlightCliArgumentError);
  const hasPredecessorPath = Object.hasOwn(options, "predecessorStatePath");
  const hasPredecessorDigest = Object.hasOwn(options, "expectedPredecessorSha256");
  if (hasPredecessorPath !== hasPredecessorDigest) throw new FlightCliArgumentError("Both predecessor options must be supplied together.");
  if (options.expectedStateSequence === 0 && hasPredecessorPath) throw new FlightCliArgumentError("Genesis sequence 0 must not supply predecessor options.");
  if (options.expectedStateSequence > 0 && !hasPredecessorPath) throw new FlightCliArgumentError("Non-genesis sequence requires both predecessor options.");
  if (hasPredecessorDigest) requireDigest(options.expectedPredecessorSha256, "--expected-predecessor-sha256", FlightCliArgumentError);
  return options;
};

export const runFeatureFlightStatusCli = async (argv, streams = process) => {
  try {
    const options = parseFlightStatusArguments(argv);
    if (options.help) {
      streams.stdout.write(`${STATUS_USAGE}\n`);
      return 0;
    }
    const status = await computeFeatureFlightStatus(options);
    streams.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return 0;
  } catch (error) {
    streams.stderr.write(`SHIELD flight status: ${error instanceof Error ? error.message : error}\n${STATUS_USAGE}\n`);
    return error instanceof FlightCliArgumentError ? 2 : 1;
  }
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await runFeatureFlightStatusCli(process.argv.slice(2));
}
