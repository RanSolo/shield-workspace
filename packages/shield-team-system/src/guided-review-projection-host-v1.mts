import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  createGuidedReviewProjectionV1,
  validateGuidedReviewProjectionV1,
  type GuidedReviewProjectionTargetV1,
  type GuidedReviewProjectionV1,
} from "./guided-review-projection-v1.mjs";
import { readGuidedReviewRoutePackageJsonV1, resolveGuidedReviewRoutePackagePathsV1,
  type GuidedReviewRoutePackagePathsV1 } from "./guided-review-route-request-v1.mjs";
import type { GuidedReviewReadyV1 } from "./guided-review-route-resolution-host-v1.mjs";
import { validateGuidedReviewPlaybookV1, validateGuidedReviewSessionV1, type GuidedReviewSessionV1 } from "./guided-review-v1.mjs";
import type { PreparedPublicationReadyResultV1 } from "./mission-preparation-host-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_CURRENT_PROJECTION_FILENAME_V1 = "current-projection.json" as const;

export interface ProjectCurrentGuidedReviewStepHostInputV1 {
  readonly repositoryRoot: string;
  readonly preparation: PreparedPublicationReadyResultV1;
  readonly resolution: GuidedReviewReadyV1;
  readonly expectedSessionDigest: string;
}

export interface GuidedReviewProjectionHostDependenciesV1 {
  readonly runGit: (root: string, argv: readonly string[]) => Promise<string>;
  readonly resolvePaths: typeof resolveGuidedReviewRoutePackagePathsV1;
  readonly readArtifact: typeof readGuidedReviewRoutePackageJsonV1;
  readonly afterProjectionLockAcquired?: () => Promise<void>;
  readonly afterProjectionReplace?: () => Promise<void>;
}

export type GuidedReviewProjectionHostResultV1 = Readonly<
  | { state: "ready"; projection: GuidedReviewProjectionV1; projectionPath: string }
  | { state: "projection_stale"; code: "GUIDED_REVIEW_PROJECTION_STALE"; errors: readonly string[] }
  | { state: "projection_unavailable"; code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE"; errors: readonly string[] }
>;

export type GuidedReviewProjectionContextHostResultV1 = Readonly<
  | { state: "ready"; projection: GuidedReviewProjectionV1 }
  | { state: "projection_stale"; code: "GUIDED_REVIEW_PROJECTION_STALE"; errors: readonly string[] }
  | { state: "projection_unavailable"; code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE"; errors: readonly string[] }
>;

const MAX_PROJECTION_BYTES = 2 * 1024 * 1024;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/@# +:=,-]+$/u;

function stale(error: string): GuidedReviewProjectionHostResultV1 {
  return Object.freeze({ state: "projection_stale", code: "GUIDED_REVIEW_PROJECTION_STALE", errors: Object.freeze([error]) });
}
function unavailable(error: string): GuidedReviewProjectionHostResultV1 {
  return Object.freeze({ state: "projection_unavailable", code: "GUIDED_REVIEW_PROJECTION_UNAVAILABLE", errors: Object.freeze([error]) });
}
function git(root: string, argv: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => execFile("git", [...argv], { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    (error, stdout) => error === null ? resolvePromise(stdout.trimEnd()) : reject(error)));
}
const DEFAULT_DEPENDENCIES: GuidedReviewProjectionHostDependenciesV1 = Object.freeze({
  runGit: git,
  resolvePaths: resolveGuidedReviewRoutePackagePathsV1,
  readArtifact: readGuidedReviewRoutePackageJsonV1,
});
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function secureRead(path: string): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 ||
      before.size < 1 || before.size > MAX_PROJECTION_BYTES) throw new Error("projection_file_invalid");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error("projection_file_changed");
    }
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== 1 ||
        !pathAfter.isFile() || pathAfter.isSymbolicLink() || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino ||
        pathAfter.nlink !== 1 || pathAfter.size !== opened.size || (pathAfter.mode & 0o777) !== 0o600) throw new Error("projection_file_changed");
    return bytes;
  } finally { await handle.close(); }
}

type CurrentContext = Readonly<{ root: string; session: GuidedReviewSessionV1; stageId: string; checkpointId: string; stepId: string;
  paths: GuidedReviewRoutePackagePathsV1; projectionPath: string }>;

async function currentContext(
  input: ProjectCurrentGuidedReviewStepHostInputV1,
  dependencies: GuidedReviewProjectionHostDependenciesV1,
): Promise<CurrentContext | GuidedReviewProjectionHostResultV1> {
  if (typeof input.repositoryRoot !== "string" || !isAbsolute(input.repositoryRoot) || input.preparation.state !== "publication_ready" ||
      input.resolution.state !== "guided_review_ready" || input.preparation.missionId !== input.resolution.missionId ||
      input.preparation.observation.headRevision !== input.resolution.exactRevision || input.resolution.request.missionId !== input.preparation.missionId ||
      input.resolution.request.repositoryId !== input.preparation.observation.repositoryId ||
      input.resolution.request.branch !== input.preparation.observation.branch || input.resolution.request.exactRevision !== input.resolution.exactRevision ||
      input.resolution.overlay.overlayId !== input.resolution.compiledRoute.overlay.overlayId ||
      input.resolution.overlay.overlayDigest !== input.resolution.compiledRoute.overlay.overlayDigest ||
      input.resolution.playbook.plan.planDigest !== input.resolution.request.plan.planDigest ||
      input.expectedSessionDigest.length === 0) return stale("Projection input is not the current exact prepared Guided Review route.");
  let root: string;
  try {
    root = await realpath(resolve(input.repositoryRoot));
    const top = await realpath(await dependencies.runGit(root, ["rev-parse", "--show-toplevel"]));
    const branch = await dependencies.runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const head = await dependencies.runGit(root, ["rev-parse", "HEAD"]);
    if (root !== top || root !== input.preparation.observation.canonicalRoot || branch !== input.preparation.observation.branch ||
        head !== input.preparation.observation.headRevision || head !== input.resolution.exactRevision) {
      return stale("Repository root, attached branch, or exact HEAD no longer matches the projection authority boundary.");
    }
    await dependencies.runGit(root, ["merge-base", "--is-ancestor", input.preparation.observation.initialHeadRevision, head]);
  } catch { return stale("Reviewed base ancestry or exact repository identity is stale."); }
  const resolvedPaths = await dependencies.resolvePaths(root, input.resolution.request);
  if (resolvedPaths.state !== "ready" || canonicalJson(resolvedPaths.value) !== canonicalJson(input.resolution.paths)) {
    return stale("Guided Review package paths are not the canonical paths for the exact request and repository root.");
  }
  const playbook = validateGuidedReviewPlaybookV1(input.resolution.playbook);
  if (playbook.state !== "ready") return unavailable("The exact Guided Review playbook is unavailable.");
  const stored = await dependencies.readArtifact(root, input.resolution.request, "session");
  if (stored.state !== "ready") return unavailable("The current Guided Review session artifact is unavailable.");
  const session = validateGuidedReviewSessionV1(playbook.value, stored.value);
  if (session.state !== "ready") return unavailable("The current Guided Review session artifact is invalid.");
  if (session.value.sessionDigest !== input.expectedSessionDigest || session.value.exactRevision !== input.resolution.exactRevision ||
      session.value.playbookDigest !== playbook.value.playbookDigest || session.value.overlayId !== input.resolution.overlay.overlayId ||
      session.value.overlayDigest !== input.resolution.overlay.overlayDigest || session.value.compiledRouteDigest !== input.resolution.compiledRoute.compiledRouteDigest) {
    return stale("Guided Review session, route, overlay, or playbook binding changed before projection.");
  }
  if (session.value.state === "completed" || session.value.currentStageId === null || session.value.currentStepId === null) {
    return unavailable("The Guided Review session has no current step to project.");
  }
  const stage = playbook.value.stages.find((candidate) => candidate.stageId === session.value.currentStageId);
  const step = stage?.steps.find((candidate) => candidate.stepId === session.value.currentStepId);
  if (stage === undefined || step === undefined) return unavailable("The current Guided Review stage or step is absent from the exact playbook.");
  return Object.freeze({ root, session: session.value, stageId: stage.stageId, checkpointId: stage.checkpointId, stepId: step.stepId,
    paths: resolvedPaths.value, projectionPath: join(resolvedPaths.value.packageDirectory, GUIDED_REVIEW_CURRENT_PROJECTION_FILENAME_V1) });
}

function excerpt(line: string): string { return line.length <= 500 ? line : line.slice(0, 500); }
function diffTarget(relativePath: string, reviewBase: string, head: string, bytes: string, targetType: "local_diff" | "evidence"): GuidedReviewProjectionTargetV1 {
  const lines = bytes.split("\n");
  const index = lines.findIndex((line) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/u.test(line));
  const match = index < 0 ? null : /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(lines[index] ?? "");
  const remainder = index < 0 ? [] : lines.slice(index + 1);
  const nextHunk = remainder.findIndex((line) => line.startsWith("@@ "));
  const hunk = nextHunk < 0 ? remainder : remainder.slice(0, nextHunk);
  const removed = hunk.filter((line) => line.startsWith("-") && !line.startsWith("---")).slice(0, 20).map((line) => excerpt(line.slice(1)));
  const added = hunk.filter((line) => line.startsWith("+") && !line.startsWith("+++")).slice(0, 20).map((line) => excerpt(line.slice(1)));
  const context = hunk.filter((line) => line.startsWith(" ")).slice(0, 20).map((line) => excerpt(line.slice(1)));
  return Object.freeze({ targetType, relativePath,
    oldRange: Object.freeze({ start: Number(match?.[1] ?? 0), lines: Number(match?.[2] ?? (match === null ? 0 : 1)) }),
    newRange: Object.freeze({ start: Number(match?.[3] ?? 0), lines: Number(match?.[4] ?? (match === null ? 0 : 1)) }),
    excerpts: Object.freeze({ before: Object.freeze(removed), focus: Object.freeze(added), after: Object.freeze(context) }),
    navigation: Object.freeze({ executor: "git", argv: Object.freeze(["diff", "--no-ext-diff", "--no-renames", "--unified=3", reviewBase, head, "--", `:(top,literal)${relativePath}`]) }),
  });
}

async function buildProjection(input: ProjectCurrentGuidedReviewStepHostInputV1, context: CurrentContext,
  dependencies: GuidedReviewProjectionHostDependenciesV1): Promise<GuidedReviewProjectionV1 | null> {
  const stage = input.resolution.playbook.stages.find((candidate) => candidate.stageId === context.stageId);
  const step = stage?.steps.find((candidate) => candidate.stepId === context.stepId);
  if (stage === undefined || step === undefined) return null;
  const inspections = input.resolution.overlay.inspectionPoints.filter((candidate) => candidate.targetStepId === step.stepId);
  const sources = inspections.length > 0 ? inspections : [{ inspectionPointId: `projection:${step.stepId}`, targetStepId: step.stepId,
    title: step.title, instructions: step.instructions, relevantPaths: step.relevantPaths, evidenceRefs: step.evidenceRefs }];
  const groups = [];
  for (const source of sources) {
    const descriptors = [...new Set(source.relevantPaths.length > 0 ? source.relevantPaths : input.preparation.observation.changedPaths)].sort();
    if (descriptors.length === 0 || descriptors.length > 64 || descriptors.some((path) => path.length > 512 || !SAFE_PATH.test(path))) return null;
    const targets: GuidedReviewProjectionTargetV1[] = [];
    for (const path of descriptors) {
      const argv = ["diff", "--no-ext-diff", "--no-renames", "--unified=3", input.preparation.observation.initialHeadRevision,
        input.preparation.observation.headRevision, "--", `:(top,literal)${path}`];
      const diff = await dependencies.runGit(context.root, argv);
      targets.push(diffTarget(path, input.preparation.observation.initialHeadRevision, input.preparation.observation.headRevision, diff,
        source.evidenceRefs.includes(path) ? "evidence" : "local_diff"));
    }
    groups.push({ behaviorGroupId: source.inspectionPointId, title: source.title, instructions: [...source.instructions],
      rationale: input.resolution.overlay.rationale, targets });
  }
  const created = createGuidedReviewProjectionV1({ schemaVersion: 1, contractVersion: "guided.review.projection.v1", authority: "none", durability: "ephemeral",
    missionId: input.preparation.missionId, repositoryId: input.preparation.observation.repositoryId, canonicalRoot: context.root,
    branch: input.preparation.observation.branch, planningBaseRevision: input.preparation.protectedGraph.transitionPlan.planningBaseRevision,
    reviewBaseRevision: input.preparation.observation.initialHeadRevision, exactRevision: input.preparation.observation.headRevision,
    requestId: input.resolution.request.requestId, requestDigest: input.resolution.request.requestDigest,
    compiledRouteDigest: input.resolution.compiledRoute.compiledRouteDigest, overlayId: input.resolution.overlay.overlayId,
    overlayDigest: input.resolution.overlay.overlayDigest, playbookDigest: input.resolution.playbook.playbookDigest,
    sessionId: context.session.sessionId, sessionDigest: context.session.sessionDigest, stageId: context.stageId,
    checkpointId: context.checkpointId, stepId: context.stepId, behaviorGroups: groups });
  return created.state === "ready" ? created.value : null;
}

async function secureReplace(path: string, bytes: string): Promise<void> {
  const directory = dirname(path);
  if (await realpath(directory) !== directory) throw new Error("projection_directory_invalid");
  const prior = await lstat(path).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (prior !== null && (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1 || (prior.mode & 0o777) !== 0o600)) {
    throw new Error("projection_file_invalid");
  }
  const temporary = join(directory, `.current-projection-${process.pid}-${randomUUID()}.tmp`);
  try {
    const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.chmod(0o600); await output.writeFile(bytes, "utf8"); await output.sync(); } finally { await output.close(); }
    await rename(temporary, path);
    await syncDirectory(directory);
    if (await secureRead(path) !== bytes) throw new Error("projection_readback_mismatch");
  } finally { await unlink(temporary).catch(() => undefined); }
}

async function exclusiveProjectionLock(path: string): Promise<Readonly<{ handle: FileHandle; dev: number | bigint; ino: number | bigint }>> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  await handle.chmod(0o600);
  await handle.sync();
  const stat = await handle.stat();
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) { await handle.close(); throw new Error("projection_lock_invalid"); }
  return Object.freeze({ handle, dev: stat.dev, ino: stat.ino });
}

async function releaseProjectionLock(path: string, lock: Readonly<{ handle: FileHandle; dev: number | bigint; ino: number | bigint }>): Promise<void> {
  await lock.handle.close();
  const current = await lstat(path).catch(() => null);
  if (current?.isFile() && !current.isSymbolicLink() && current.nlink === 1 && current.dev === lock.dev && current.ino === lock.ino) {
    await unlink(path);
    await syncDirectory(dirname(path));
  }
}

async function restorePriorProjection(path: string, priorBytes: string | null): Promise<void> {
  if (priorBytes !== null) { await secureReplace(path, priorBytes); return; }
  const current = await lstat(path).catch(() => null);
  if (current?.isFile() && !current.isSymbolicLink() && current.nlink === 1 && (current.mode & 0o777) === 0o600) {
    await unlink(path);
    await syncDirectory(dirname(path));
  }
}

export async function projectCurrentGuidedReviewStepHostV1(
  input: ProjectCurrentGuidedReviewStepHostInputV1,
  dependencies: GuidedReviewProjectionHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<GuidedReviewProjectionHostResultV1> {
  const context = await currentContext(input, dependencies);
  if ("state" in context) return context;
  let projection: GuidedReviewProjectionV1 | null;
  try { projection = await buildProjection(input, context, dependencies); }
  catch { return unavailable("The current local literal diff could not be projected."); }
  if (projection === null) return unavailable("The current Guided Review step has no bounded local projection targets.");
  const path = context.projectionPath;
  const lockPath = `${path}.lock`;
  let lock: Awaited<ReturnType<typeof exclusiveProjectionLock>>;
  try { lock = await exclusiveProjectionLock(lockPath); }
  catch { return unavailable("The current Guided Review projection is already being refreshed or cannot be locked securely."); }
  try {
    await dependencies.afterProjectionLockAcquired?.();
    const revalidated = await currentContext(input, dependencies);
    if ("state" in revalidated) return revalidated;
    if (revalidated.session.sessionDigest !== context.session.sessionDigest || revalidated.stageId !== context.stageId ||
        revalidated.stepId !== context.stepId || revalidated.root !== context.root || revalidated.projectionPath !== path) {
      return stale("Repository or Guided Review session context changed during projection.");
    }
    let priorBytes: string | null;
    try { priorBytes = await secureRead(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return unavailable("Existing current projection is not a secure regular 0600 file.");
      priorBytes = null;
    }
    try { await secureReplace(path, canonicalJson(projection)); }
    catch { return unavailable("The current Guided Review projection could not be materialized securely."); }
    const readback = await secureRead(path).catch(() => null);
    await dependencies.afterProjectionReplace?.();
    const finalContext = await currentContext(input, dependencies);
    if (readback !== canonicalJson(projection) || "state" in finalContext || finalContext.session.sessionDigest !== context.session.sessionDigest ||
        finalContext.stageId !== context.stageId || finalContext.stepId !== context.stepId || finalContext.root !== context.root || finalContext.projectionPath !== path) {
      await restorePriorProjection(path, priorBytes).catch(() => undefined);
      return stale("Repository or Guided Review session context changed before projection commit completed.");
    }
    return Object.freeze({ state: "ready", projection, projectionPath: path });
  } finally { await releaseProjectionLock(lockPath, lock).catch(() => undefined); }
}

export async function revalidateGuidedReviewProjectionContextHostV1(
  input: ProjectCurrentGuidedReviewStepHostInputV1,
  dependencies: GuidedReviewProjectionHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<GuidedReviewProjectionContextHostResultV1> {
  const context = await currentContext(input, dependencies);
  if ("state" in context) return context;
  let projection: GuidedReviewProjectionV1 | null;
  try { projection = await buildProjection(input, context, dependencies); }
  catch { return unavailable("The current local literal diff context could not be revalidated."); }
  if (projection === null) return unavailable("The current Guided Review step has no bounded local projection context.");
  const finalContext = await currentContext(input, dependencies);
  if ("state" in finalContext) return finalContext;
  if (finalContext.session.sessionDigest !== context.session.sessionDigest || finalContext.stageId !== context.stageId ||
      finalContext.stepId !== context.stepId || finalContext.root !== context.root || finalContext.projectionPath !== context.projectionPath) {
    return stale("Repository or Guided Review session context changed during read-only projection revalidation.");
  }
  return Object.freeze({ state: "ready", projection });
}

export async function readCurrentGuidedReviewProjectionHostV1(input: ProjectCurrentGuidedReviewStepHostInputV1,
  dependencies: GuidedReviewProjectionHostDependenciesV1 = DEFAULT_DEPENDENCIES): Promise<GuidedReviewProjectionHostResultV1> {
  const context = await currentContext(input, dependencies);
  if ("state" in context) return context;
  const path = context.projectionPath;
  try {
    const bytes = await secureRead(path);
    const validated = validateGuidedReviewProjectionV1(JSON.parse(bytes) as unknown);
    if (validated.state !== "ready" || bytes !== canonicalJson(validated.value) || validated.value.canonicalRoot !== context.root ||
        validated.value.exactRevision !== input.preparation.observation.headRevision || validated.value.reviewBaseRevision !== input.preparation.observation.initialHeadRevision ||
        validated.value.sessionDigest !== context.session.sessionDigest || validated.value.stageId !== context.stageId || validated.value.stepId !== context.stepId) {
      return stale("Stored Guided Review projection is not bound to the current exact session step and repository state.");
    }
    const revalidated = await currentContext(input, dependencies);
    if ("state" in revalidated) return revalidated;
    if (revalidated.session.sessionDigest !== context.session.sessionDigest || revalidated.stageId !== context.stageId ||
        revalidated.stepId !== context.stepId || revalidated.root !== context.root) {
      return stale("Repository or Guided Review session context changed while reading the projection.");
    }
    return Object.freeze({ state: "ready", projection: validated.value, projectionPath: path });
  } catch { return unavailable("The current Guided Review projection could not be read securely."); }
}
