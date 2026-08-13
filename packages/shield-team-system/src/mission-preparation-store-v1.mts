import { constants } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { lstat, link, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";
import {
  validateParentPlanReviewEvidenceV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1,
  type ParentPlanReviewEvidenceV1,
  type TransitionIntentV1,
  type TransitionPlanV1,
} from "@shield/mission-preparation";

export const MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION = 1 as const;
export const MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID = "mission.reviewed-transition-graph.v1" as const;
export const MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX = "reviewed-transition-graph:" as const;

const INPUT_FIELDS = ["transitionPlan", "parentPlanReviewEvidence", "transitionIntent"] as const;
const GRAPH_FIELDS = [
  "schemaVersion", "schemaId", "authority", "graphId", "graphDigest", "transitionPlan", "parentPlanReviewEvidence", "transitionIntent",
] as const;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const GRAPH_ID = /^reviewed-transition-graph:[A-Za-z0-9_-]{43}$/u;
export const MISSION_REVIEWED_TRANSITION_GRAPH_FILE = "reviewed-transition.json" as const;
const MISSION_REVIEWED_TRANSITION_GRAPH_DIRECTORY_MODE = 0o700;
const MISSION_REVIEWED_TRANSITION_GRAPH_FILE_MODE = 0o600;

export interface MissionReviewedTransitionGraphMaterializationPathV1 {
  readonly repositoryRoot: string;
  readonly shieldDirectory: string;
  readonly auditDirectory: string;
  readonly missionPreparationDirectory: string;
  readonly missionDirectory: string;
  readonly missionIdDigest: string;
  readonly graphPath: string;
}

export interface MissionReviewedTransitionGraphMaterializationInputV1 {
  readonly repositoryRoot: string;
  readonly graph: MissionReviewedTransitionGraphV1;
}

export type MissionReviewedTransitionGraphMaterializationResultV1 = Readonly<
  | { state: "materialized"; graphPath: string; graphId: string; graphDigest: string; bytes: string }
  | { state: "already_materialized"; graphPath: string; graphId: string; graphDigest: string }
  | { state: "materialization_conflict"; graphPath: string; existingGraphId: string; existingGraphDigest: string }
  | { state: "recovery_required"; graphPath: string; code: "recovery_required"; errors: readonly string[] }
  | { state: "invalid"; code: "invalid_materialization_input"; errors: readonly string[] }
  | { state: "invalid"; code: "invalid_materialization_graph"; errors: readonly string[] }
>;

export type MissionReviewedTransitionGraphReadResultV1 = Readonly<
  | { state: "read"; graphPath: string; graph: MissionReviewedTransitionGraphV1; bytes: string }
  | { state: "invalid"; code: "reviewed_transition_graph_unavailable"; errors: readonly string[] }
>;

type MissionReviewedTransitionGraphFileHandle = Awaited<ReturnType<typeof open>>;
type MissionReviewedTransitionGraphFileIdentity = Pick<MissionReviewedTransitionGraphFileStats, "dev" | "ino">;

type MissionReviewedTransitionGraphFileStats = {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly nlink: number;
  readonly mode: number;
  readonly size: number;
  readonly isFile: () => boolean;
  readonly isSymbolicLink: () => boolean;
};

interface MissionReviewedTransitionGraphMaterializationDependencies {
  readonly randomBytes: (size: number) => Buffer;
  readonly openPath: (path: string, flags: number, mode?: number) => Promise<MissionReviewedTransitionGraphFileHandle>;
  readonly mkdirPath: (path: string, mode: number) => Promise<void>;
  readonly realpathPath: (path: string) => Promise<string>;
  readonly lstatPath: (path: string) => Promise<import("node:fs").Stats>;
  readonly linkPath: (target: string, destination: string) => Promise<void>;
  readonly unlinkPath: (path: string) => Promise<void>;
  readonly syncDirectoryPath: (path: string) => Promise<void>;
  readonly statHandle: (handle: MissionReviewedTransitionGraphFileHandle) => Promise<MissionReviewedTransitionGraphFileStats>;
  readonly syncHandle: (handle: MissionReviewedTransitionGraphFileHandle) => Promise<void>;
  readonly closeHandle: (handle: MissionReviewedTransitionGraphFileHandle) => Promise<void>;
  readonly writeHandle: (handle: MissionReviewedTransitionGraphFileHandle, content: string) => Promise<number>;
  readonly readHandle: (handle: MissionReviewedTransitionGraphFileHandle, size: number) => Promise<string>;
}

function defaultMaterializationDependencies(): MissionReviewedTransitionGraphMaterializationDependencies {
  return {
    randomBytes,
    openPath: (path, flags, mode) => open(path, flags, mode),
    mkdirPath: async (path, mode) => {
      await mkdir(path, { mode, recursive: true });
    },
    realpathPath: realpath,
    lstatPath: lstat,
    linkPath: (target, destination) => link(target, destination),
    unlinkPath: unlink,
    syncDirectoryPath: async (path) => {
      const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    },
    statHandle: (handle) => handle.stat().then((stats) => ({
      dev: stats.dev,
      ino: stats.ino,
      nlink: stats.nlink,
      mode: stats.mode,
      size: stats.size,
      isFile: stats.isFile.bind(stats),
      isSymbolicLink: stats.isSymbolicLink.bind(stats),
    })),
    syncHandle: (handle) => handle.sync(),
    closeHandle: (handle) => handle.close(),
    writeHandle: (handle, content) => handle.write(content, 0, "utf8").then((written) => written.bytesWritten),
    readHandle: async (handle, size) => {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const read = await handle.read(bytes, offset, size - offset, offset);
        if (read.bytesRead === 0) {
          throw new Error("Readback is incomplete.");
        }
        offset += read.bytesRead;
      }
      return bytes.toString("utf8");
    },
  };
}

function materializationDependencies(
  overrides: Partial<MissionReviewedTransitionGraphMaterializationDependencies> = {},
): MissionReviewedTransitionGraphMaterializationDependencies {
  return {
    ...defaultMaterializationDependencies(),
    ...overrides,
  };
}

function materializationInvalid(code: "invalid_materialization_input" | "invalid_materialization_graph", ...errors: readonly string[]) {
  return Object.freeze({
    state: "invalid",
    code,
    errors: Object.freeze(errors.length === 0 ? [code.replaceAll("_", " ")] : errors),
  });
}

function recovery(graphPath: string, ...errors: readonly string[]) {
  return Object.freeze({
    state: "recovery_required",
    graphPath,
    code: "recovery_required",
    errors: Object.freeze(errors.length === 0 ? ["Mission reviewed transition graph materialization could not be proven."] : errors),
  });
}

function sameIdentity(
  left: Pick<MissionReviewedTransitionGraphFileStats, "dev" | "ino">,
  right: Pick<MissionReviewedTransitionGraphFileStats, "dev" | "ino">,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function inside(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath !== "" && relativePath !== `..${sep}` && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

export function deriveMissionReviewedTransitionGraphMaterializationPathV1(
  repositoryRoot: string,
  missionId: string,
): MissionReviewedTransitionGraphMaterializationPathV1 {
  const missionIdDigest = createHash("sha256").update(missionId, "utf8").digest("hex");
  const resolved = resolve(repositoryRoot);
  const shieldDirectory = join(resolved, ".shield");
  const auditDirectory = join(shieldDirectory, "audit");
  const missionPreparationDirectory = join(auditDirectory, "mission-preparation");
  const missionDirectory = join(missionPreparationDirectory, missionIdDigest);
  return {
    repositoryRoot: resolved,
    shieldDirectory,
    auditDirectory,
    missionPreparationDirectory,
    missionDirectory,
    missionIdDigest,
    graphPath: join(missionDirectory, MISSION_REVIEWED_TRANSITION_GRAPH_FILE),
  };
}

async function resolveMaterializedGraphPathsWithDependencies(
  repositoryRoot: string,
  graphMissionId: string,
  dependencies: MissionReviewedTransitionGraphMaterializationDependencies,
): Promise<MissionReviewedTransitionGraphMaterializationResultV1 | MissionReviewedTransitionGraphMaterializationPathV1> {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0 || typeof graphMissionId !== "string" || graphMissionId.length === 0) {
    return materializationInvalid("invalid_materialization_input", "Mission reviewed transition graph materialization input has malformed repositoryRoot or missionId.");
  }

  const resolved = resolve(repositoryRoot);
  try {
    const repositoryRootStats = await dependencies.lstatPath(resolved);
    if (repositoryRootStats.isSymbolicLink() || !repositoryRootStats.isDirectory()) {
      return materializationInvalid("invalid_materialization_input", "Repository root must be a regular directory.");
    }
  } catch (error) {
    return recovery("recovery_required", `Repository root could not be accessed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  let repositoryRootResolved: string;
  try {
    repositoryRootResolved = await dependencies.realpathPath(resolved);
  } catch {
    return recovery("recovery_required", "Repository root realpath resolution failed.");
  }

  const paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(repositoryRootResolved, graphMissionId);
  if (!inside(repositoryRootResolved, paths.shieldDirectory) || !inside(repositoryRootResolved, paths.auditDirectory)
    || !inside(repositoryRootResolved, paths.missionPreparationDirectory) || !inside(repositoryRootResolved, paths.missionDirectory)) {
    return materializationInvalid("invalid_materialization_input", "Mission reviewed transition graph path escapes repository root.");
  }

  for (const directory of [paths.shieldDirectory, paths.auditDirectory, paths.missionPreparationDirectory, paths.missionDirectory]) {
    const directoryCreatedByThisOperation = directory !== paths.shieldDirectory;
    let directoryStats: import("node:fs").Stats;
    try {
      directoryStats = await dependencies.lstatPath(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return recovery("recovery_required", `Mission reviewed transition directory could not be resolved: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
      }
      try {
        await dependencies.mkdirPath(directory, MISSION_REVIEWED_TRANSITION_GRAPH_DIRECTORY_MODE);
      } catch (creationError) {
        return recovery("recovery_required", `Mission reviewed transition directory could not be created: ${(creationError as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
      }
      try {
        directoryStats = await dependencies.lstatPath(directory);
      } catch (errorAfterCreate) {
        return recovery("recovery_required", `Mission reviewed transition directory could not be verified after creation: ${(errorAfterCreate as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
      }
    }
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
      return materializationInvalid("invalid_materialization_input", "Mission reviewed transition directory is unsafe.");
    }
    if ((directoryStats.mode & 0o22) !== 0) {
      return materializationInvalid("invalid_materialization_input", "Mission reviewed transition directory has unsafe mode.");
    }
    if (directoryCreatedByThisOperation && (directoryStats.mode & 0o777) !== MISSION_REVIEWED_TRANSITION_GRAPH_DIRECTORY_MODE) {
      return materializationInvalid("invalid_materialization_input", "Mission reviewed transition directory has incorrect mode.");
    }
    try {
      const realDirectory = await dependencies.realpathPath(directory);
      if (realDirectory !== directory) {
        return materializationInvalid("invalid_materialization_input", "Mission reviewed transition directory is aliased.");
      }
    } catch {
      return materializationInvalid("invalid_materialization_input", "Mission reviewed transition directory aliasing could not be verified.");
    }
    try {
      await dependencies.syncDirectoryPath(directory);
    } catch {
      return recovery("recovery_required", "Mission reviewed transition directory fsync failed.");
    }
  }

  return paths;
}

async function readExistingMaterializedGraph(
  graphPath: string,
  expectedGraphDigest: string,
  expectedGraphId: string,
  expectedBytes: string,
  expectedSize: number,
  mode: number,
  dependencies: MissionReviewedTransitionGraphMaterializationDependencies,
): Promise<{
  readonly state: "missing" | "invalid" | "conflict" | "accepted";
  readonly errors?: readonly string[];
  readonly graphId?: string;
  readonly graphDigest?: string;
  readonly graphPath?: string;
  readonly identity?: MissionReviewedTransitionGraphFileIdentity;
}> {
  let existingStats: import("node:fs").Stats;
  try {
    existingStats = await dependencies.lstatPath(graphPath);
  } catch (error) {
    return { state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "invalid", errors: Object.freeze(["reviewed transition graph path could not be read."]) };
  }
  if (existingStats.isSymbolicLink() || !existingStats.isFile()) {
    return { state: "invalid", errors: Object.freeze(["reviewed transition graph path is unsafe."]) };
  }
  if (existingStats.nlink !== 1) {
    return { state: "invalid", errors: Object.freeze(["reviewed transition graph path is not a unique regular file."]) };
  }
  if ((existingStats.mode & 0o777) !== mode) {
    return { state: "invalid", errors: Object.freeze(["reviewed transition graph file mode is not exact."]) };
  }

  let handle: MissionReviewedTransitionGraphFileHandle | undefined;
  try {
    handle = await dependencies.openPath(graphPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await dependencies.statHandle(handle);
    if (!sameIdentity(existingStats, stats) || !stats.isFile() || stats.isSymbolicLink() || stats.size < 1) {
      return { state: "invalid", errors: Object.freeze(["reviewed transition graph path is not a stable regular file."]) };
    }
    if (stats.nlink !== 1) {
      return { state: "invalid", errors: Object.freeze(["reviewed transition graph path is not a unique regular file."]) };
    }
    if ((stats.mode & 0o777) !== mode) {
      return {
        state: "invalid",
        errors: Object.freeze(["reviewed transition graph file mode is not exact."]),
        graphPath,
      };
    }
    const bytes = await dependencies.readHandle(handle, stats.size);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      return { state: "invalid", errors: Object.freeze(["reviewed transition graph file is not valid JSON."]) };
    }
    const validated = validateMissionReviewedTransitionGraphV1(parsed);
    if (validated.state !== "valid") {
      return { state: "invalid", errors: Object.freeze(validated.errors) };
    }
    if (validated.value.graphId === expectedGraphId && validated.value.graphDigest === expectedGraphDigest) {
      if (stats.size !== expectedSize || bytes !== expectedBytes) {
        return { state: "invalid", errors: Object.freeze(["reviewed transition graph file is invalid."]) };
      }
      return {
        state: "accepted",
        graphPath,
        graphId: expectedGraphId,
        graphDigest: expectedGraphDigest,
        identity: { dev: stats.dev, ino: stats.ino },
      };
    }
    return {
      state: "conflict",
      graphPath,
      graphId: validated.value.graphId,
      graphDigest: validated.value.graphDigest,
    };
  } catch (error) {
    return {
      state: "invalid",
      errors: Object.freeze([`reviewed transition graph readback failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`]),
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function materializeMissionReviewedTransitionGraphV1WithDependencies(
  input: unknown,
  dependencies: MissionReviewedTransitionGraphMaterializationDependencies,
): Promise<MissionReviewedTransitionGraphMaterializationResultV1> {
  const copied = cloneClosedData(input);
  if (!plain(copied) || !exact(copied, ["repositoryRoot", "graph"])) {
    return materializationInvalid("invalid_materialization_input", "Mission reviewed transition materialization input must be closed data with repositoryRoot and graph.");
  }

  const graph = validateMissionReviewedTransitionGraphV1(copied.graph);
  if (graph.state !== "valid") {
    return materializationInvalid("invalid_materialization_graph", ...graph.errors);
  }

  const root = (copied as { readonly repositoryRoot: string }).repositoryRoot;
  const missionId = graph.value.transitionPlan.missionId;
  const paths = await resolveMaterializedGraphPathsWithDependencies(root, missionId, dependencies);
  if ("state" in paths) {
    return paths;
  }

  const resolvedPaths = paths;
  const bytes = canonicalJson(graph.value);
  const expectedMode = MISSION_REVIEWED_TRANSITION_GRAPH_FILE_MODE;
  const expectedSize = Buffer.byteLength(bytes, "utf8");
  const existing = await readExistingMaterializedGraph(
    resolvedPaths.graphPath,
    graph.value.graphDigest,
    graph.value.graphId,
    bytes,
    expectedSize,
    expectedMode,
    dependencies,
  );
  if (existing.state === "accepted") {
    return Object.freeze({
      state: "already_materialized",
      graphPath: resolvedPaths.graphPath,
      graphId: graph.value.graphId,
      graphDigest: graph.value.graphDigest,
    });
  }
  if (existing.state === "conflict") {
    if (existing.graphId === undefined || existing.graphDigest === undefined) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Existing reviewed transition graph could not be read reliably."]),
      });
    }
    return Object.freeze({
      state: "materialization_conflict",
      graphPath: resolvedPaths.graphPath,
      existingGraphId: existing.graphId,
      existingGraphDigest: existing.graphDigest,
    });
  }
  if (existing.state === "invalid") {
    return Object.freeze({
      state: "recovery_required",
      graphPath: resolvedPaths.graphPath,
      code: "recovery_required",
      errors: existing.errors ?? Object.freeze(["Existing reviewed transition graph cannot be proven."]),
    });
  }

  const parentDirectory = dirname(resolvedPaths.graphPath);
  const tempPrefix = dependencies.randomBytes(16).toString("hex");
  const tempPath = `${resolvedPaths.graphPath}.${tempPrefix}.tmp`;
  let tempHandle: MissionReviewedTransitionGraphFileHandle | undefined;
  let verifyHandle: MissionReviewedTransitionGraphFileHandle | undefined;
  let tempStats: MissionReviewedTransitionGraphFileIdentity | null = null;
  let tempUnlinked = false;
  let linked = false;

  let beforeParentIdentity: MissionReviewedTransitionGraphFileIdentity | null = null;
  try {
    const parentStats = await dependencies.lstatPath(parentDirectory);
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Mission reviewed transition directory is unsafe before write."]),
      });
    }
    beforeParentIdentity = { dev: parentStats.dev, ino: parentStats.ino };

    tempHandle = await dependencies.openPath(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, expectedMode);
    const opened = await dependencies.statHandle(tempHandle);
    if (!opened.isFile() || opened.isSymbolicLink() || opened.nlink !== 1 || (opened.mode & 0o777) !== expectedMode) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Temporary reviewed transition file is not a stable regular file."]),
      });
    }
    const openedLstat = await dependencies.lstatPath(tempPath);
    if (openedLstat.isSymbolicLink() || !openedLstat.isFile() || openedLstat.nlink !== 1 || !sameIdentity(opened, openedLstat)) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Temporary reviewed transition file is not stable in filesystem view."]),
      });
    }
    tempStats = { dev: opened.dev, ino: opened.ino };

    const written = await dependencies.writeHandle(tempHandle, bytes);
    if (written !== expectedSize) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Temporary reviewed transition write was incomplete."]),
      });
    }

    const writtenStats = await dependencies.statHandle(tempHandle);
    if (!sameIdentity(opened, writtenStats) || writtenStats.nlink !== 1 || writtenStats.size !== expectedSize || (writtenStats.mode & 0o777) !== expectedMode) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Temporary reviewed transition file changed during write."]),
      });
    }

    verifyHandle = await dependencies.openPath(tempPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let writtenBytes: string;
    try {
      writtenBytes = await dependencies.readHandle(verifyHandle, expectedSize);
    } catch (error) {
      try {
        await dependencies.closeHandle(verifyHandle);
      } catch (closeError) {
        return Object.freeze({
          state: "recovery_required",
          graphPath: resolvedPaths.graphPath,
          code: "recovery_required",
          errors: Object.freeze([`Temporary reviewed transition readback handle could not be closed: ${(closeError as NodeJS.ErrnoException).code ?? "unknown_error"}.`]),
        });
      } finally {
        verifyHandle = undefined;
      }
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze([`Temporary reviewed transition file readback failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`]),
      });
    }
    if (writtenBytes !== bytes) {
      try {
        await dependencies.closeHandle(verifyHandle);
      } catch (error) {
        return Object.freeze({
          state: "recovery_required",
          graphPath: resolvedPaths.graphPath,
          code: "recovery_required",
          errors: Object.freeze([`Temporary reviewed transition readback handle could not be closed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`]),
        });
      }
      verifyHandle = undefined;
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Temporary reviewed transition file contents are not exact."]),
      });
    }
    try {
      await dependencies.closeHandle(verifyHandle);
      verifyHandle = undefined;
    } catch (error) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze([`Temporary reviewed transition readback handle could not be closed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`]),
      });
    }

    await dependencies.syncHandle(tempHandle);
    await dependencies.closeHandle(tempHandle);
    tempHandle = undefined;

    await dependencies.linkPath(tempPath, resolvedPaths.graphPath);
    linked = true;

    await dependencies.syncDirectoryPath(parentDirectory);
    await dependencies.unlinkPath(tempPath);
    tempUnlinked = true;
    await dependencies.syncDirectoryPath(parentDirectory);

    const final = await readExistingMaterializedGraph(
      resolvedPaths.graphPath,
      graph.value.graphDigest,
      graph.value.graphId,
      bytes,
      expectedSize,
      expectedMode,
      dependencies,
    );
    if (final.state !== "accepted" || final.identity === undefined) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Reviewed transition final file was not exact after installation."]),
      });
    }
    if (!sameIdentity(final.identity, tempStats)) {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze(["Reviewed transition final file identity changed during installation."]),
      });
    }

    if (beforeParentIdentity !== null) {
      const afterParent = await dependencies.lstatPath(parentDirectory);
      if (afterParent.isSymbolicLink() || !afterParent.isDirectory() || !sameIdentity(beforeParentIdentity, afterParent)) {
        return Object.freeze({
          state: "recovery_required",
          graphPath: resolvedPaths.graphPath,
          code: "recovery_required",
          errors: Object.freeze(["Mission reviewed transition directory was replaced during materialization."]),
        });
      }
    }

    return Object.freeze({
      state: "materialized",
      graphPath: resolvedPaths.graphPath,
      graphId: graph.value.graphId,
      graphDigest: graph.value.graphDigest,
      bytes,
    });
  } catch (error) {
    if (error instanceof Error && typeof (error as { graphPath?: string }).graphPath === "string") {
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze([`${(error as Error).message}`]),
      });
    }
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const raced = await readExistingMaterializedGraph(
        resolvedPaths.graphPath,
        graph.value.graphDigest,
        graph.value.graphId,
        bytes,
        expectedSize,
        expectedMode,
        dependencies,
      );
      if (raced.state === "accepted") {
        return Object.freeze({
          state: "already_materialized",
          graphPath: resolvedPaths.graphPath,
          graphId: graph.value.graphId,
          graphDigest: graph.value.graphDigest,
        });
      }
      if (raced.state === "conflict") {
        if (raced.graphId === undefined || raced.graphDigest === undefined) {
          return Object.freeze({
            state: "recovery_required",
            graphPath: resolvedPaths.graphPath,
            code: "recovery_required",
            errors: Object.freeze(["Existing reviewed transition graph could not be read reliably."]),
          });
        }
        return Object.freeze({
          state: "materialization_conflict",
          graphPath: resolvedPaths.graphPath,
          existingGraphId: raced.graphId,
          existingGraphDigest: raced.graphDigest,
        });
      }
      if (raced.state === "invalid") {
        return Object.freeze({
          state: "recovery_required",
          graphPath: resolvedPaths.graphPath,
          code: "recovery_required",
          errors: raced.errors ?? Object.freeze(["Existing reviewed transition graph cannot be proven."]),
        });
      }
      return Object.freeze({
        state: "recovery_required",
        graphPath: resolvedPaths.graphPath,
        code: "recovery_required",
        errors: Object.freeze([`Existing reviewed transition graph could not be verified: ${String((error as NodeJS.ErrnoException).code ?? "unknown_error")}.`]),
      });
    }
    const code = (error as NodeJS.ErrnoException).code;
    return Object.freeze({
      state: "recovery_required",
      graphPath: resolvedPaths.graphPath,
      code: "recovery_required",
      errors: Object.freeze([`Reviewed transition materialization failed: ${code ?? "unknown_error"}.`]),
    });
  } finally {
    if (verifyHandle !== undefined) {
      try {
        await verifyHandle.close();
      } catch {
        // Ignore verify close uncertainty in cleanup.
      }
      verifyHandle = undefined;
    }
    if (tempHandle !== undefined) {
      try {
        await tempHandle.close();
      } catch {
        // Ignore close uncertainty; final recovery path will rely on readback.
      }
      tempHandle = undefined;
    }
    if (!linked && tempPath !== null && !tempUnlinked) {
      try {
        const observed = await dependencies.lstatPath(tempPath);
        if (tempStats && sameIdentity(tempStats, observed)) {
          await dependencies.unlinkPath(tempPath);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // Ignore cleanup uncertainty.
        }
      }
    }
  }
}

export async function materializeMissionReviewedTransitionGraphV1(
  input: unknown,
  dependencies: Partial<MissionReviewedTransitionGraphMaterializationDependencies> = {},
): Promise<MissionReviewedTransitionGraphMaterializationResultV1> {
  return materializeMissionReviewedTransitionGraphV1WithDependencies(input, materializationDependencies(dependencies));
}

export async function readMissionReviewedTransitionGraphV1(input: unknown): Promise<MissionReviewedTransitionGraphReadResultV1> {
  const copied = cloneClosedData(input);
  if (!plain(copied) || !exact(copied, ["repositoryRoot", "missionId"]) ||
      typeof copied.repositoryRoot !== "string" || copied.repositoryRoot.length === 0 ||
      typeof copied.missionId !== "string" || copied.missionId.length === 0) {
    return Object.freeze({
      state: "invalid",
      code: "reviewed_transition_graph_unavailable",
      errors: Object.freeze(["Reviewed transition graph read input is invalid."]),
    });
  }

  const root = resolve(copied.repositoryRoot);
  let paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(root, copied.missionId);
  let handle: MissionReviewedTransitionGraphFileHandle | undefined;
  try {
    const canonicalRoot = await realpath(root);
    paths = deriveMissionReviewedTransitionGraphMaterializationPathV1(canonicalRoot, copied.missionId);
    if (!inside(canonicalRoot, paths.graphPath)) throw new Error("Reviewed transition graph path escapes the repository root.");
    for (const directory of [paths.shieldDirectory, paths.auditDirectory, paths.missionPreparationDirectory, paths.missionDirectory]) {
      const stats = await lstat(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(directory) !== directory) {
        throw new Error("Reviewed transition graph directory is unsafe.");
      }
    }
    const before = await lstat(paths.graphPath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o777) !== MISSION_REVIEWED_TRANSITION_GRAPH_FILE_MODE) {
      throw new Error("Reviewed transition graph is not a protected regular file.");
    }
    handle = await open(paths.graphPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened) || (opened.mode & 0o777) !== MISSION_REVIEWED_TRANSITION_GRAPH_FILE_MODE) {
      throw new Error("Reviewed transition graph identity changed during read.");
    }
    const bytes = await handle.readFile("utf8");
    const after = await lstat(paths.graphPath);
    if (!sameIdentity(opened, after) || after.nlink !== 1) throw new Error("Reviewed transition graph was replaced during read.");
    let parsed: unknown;
    try { parsed = JSON.parse(bytes); } catch { throw new Error("Reviewed transition graph JSON is malformed."); }
    const validated = validateMissionReviewedTransitionGraphV1(parsed);
    if (validated.state === "invalid" || validated.value.transitionPlan.missionId !== copied.missionId || canonicalJson(validated.value) !== bytes) {
      throw new Error("Reviewed transition graph content is invalid or non-canonical.");
    }
    return Object.freeze({ state: "read", graphPath: paths.graphPath, graph: validated.value, bytes });
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      code: "reviewed_transition_graph_unavailable",
      errors: Object.freeze([error instanceof Error ? error.message : "Reviewed transition graph could not be read."]),
    });
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export interface MissionReviewedTransitionGraphV1 {
  readonly schemaVersion: 1;
  readonly schemaId: typeof MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID;
  readonly authority: "none";
  readonly graphId: string;
  readonly graphDigest: string;
  readonly transitionPlan: TransitionPlanV1;
  readonly parentPlanReviewEvidence: ParentPlanReviewEvidenceV1;
  readonly transitionIntent: TransitionIntentV1;
}

export type MissionReviewedTransitionGraphBuildResultV1 = Readonly<
  | { state: "built"; graph: MissionReviewedTransitionGraphV1 }
  | { state: "invalid"; code: "malformed_reviewed_transition_graph_input" | "invalid_reviewed_transition_graph"; errors: readonly string[] }
>;

export type MissionReviewedTransitionGraphValidationResultV1 = Readonly<
  | { state: "valid"; value: MissionReviewedTransitionGraphV1 }
  | { state: "invalid"; code: "invalid_reviewed_transition_graph"; errors: readonly string[] }
>;

type Plain = Record<string, unknown>;

function plain(value: unknown): value is Plain {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  for (const key of keys) {
    if (typeof key !== "string") return false;
    if (!fields.includes(key)) return false;
  }
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") && descriptor.value !== undefined;
  });
}

function cloneClosedData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) throw new TypeError("non_closed_data");

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("non_plain_array");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string") || keys.length !== value.length + 1) throw new TypeError("array_sparsity");
    seen.add(value);
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("array_accessor");
      output.push(cloneClosedData(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("non_plain_data");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol_keys");
  seen.add(value);
  const output: Plain = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("object_accessor");
    output[key] = cloneClosedData(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const keys = Array.isArray(value) ? value : Object.keys(value);
    for (const key of keys) {
      // @ts-expect-error indexing into unknown closed data for mutation isolation.
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function invalidBuild(
  code: "malformed_reviewed_transition_graph_input" | "invalid_reviewed_transition_graph",
  ...errors: readonly string[]
): MissionReviewedTransitionGraphBuildResultV1 {
  return Object.freeze({
    state: "invalid",
    code,
    errors: Object.freeze(errors.length === 0 ? ["Reviewed transition graph is invalid."] : errors),
  });
}

function invalidValidation(
  code: "invalid_reviewed_transition_graph",
  ...errors: readonly string[]
): MissionReviewedTransitionGraphValidationResultV1 {
  return Object.freeze({
    state: "invalid",
    code,
    errors: Object.freeze(errors.length === 0 ? ["Reviewed transition graph is invalid."] : errors),
  });
}

export function computeMissionReviewedTransitionGraphDigestV1(input: {
  schemaVersion: 1;
  schemaId: typeof MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID;
  authority: "none";
  transitionPlan: TransitionPlanV1;
  parentPlanReviewEvidence: ParentPlanReviewEvidenceV1;
  transitionIntent: TransitionIntentV1;
}): string {
  const cloned = cloneClosedData(input);
  if (!plain(cloned) ||
    Object.getPrototypeOf(input) !== Object.getPrototypeOf(cloned) ||
    (cloned as Plain).schemaVersion !== 1 ||
    (cloned as Plain).schemaId !== MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID ||
    (cloned as Plain).authority !== "none") {
    throw new Error("Invalid reviewed transition graph digest input.");
  }

  return `sha256:${createHash("sha256").update(`${MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID}\0${canonicalJson(cloned)}`).digest("base64url")}`;
}

export function computeMissionReviewedTransitionGraphIdV1(input: string): string {
  if (!DIGEST.test(input)) throw new Error("Invalid reviewed transition graph digest.");
  return `${MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX}${input.slice("sha256:".length)}`;
}

function identityBindingsMatch(
  transitionPlan: TransitionPlanV1,
  parentPlanReviewEvidence: ParentPlanReviewEvidenceV1,
  transitionIntent: TransitionIntentV1,
): readonly string[] {
  const errors: string[] = [];

  if (
    transitionPlan.missionId !== transitionIntent.missionId ||
    transitionPlan.subjectId !== transitionIntent.subjectId ||
    transitionPlan.repositoryId !== transitionIntent.repositoryId ||
    transitionPlan.planningBaseRevision !== transitionIntent.planningBaseRevision
  ) {
    errors.push("transition_plan_and_intent_identity_mismatch");
  }

  if (transitionIntent.transitionPlanId !== transitionPlan.id || transitionIntent.transitionPlanDigest !== transitionPlan.digest) {
    errors.push("intent_transition_plan_reference_mismatch");
  }

  if (parentPlanReviewEvidence.transitionPlanId !== transitionPlan.id || parentPlanReviewEvidence.transitionPlanDigest !== transitionPlan.digest) {
    errors.push("parent_review_transition_plan_reference_mismatch");
  }

  if (
    parentPlanReviewEvidence.repositoryId !== transitionPlan.repositoryId ||
    parentPlanReviewEvidence.planningBaseRevision !== transitionPlan.planningBaseRevision ||
    parentPlanReviewEvidence.parentPlanCommit !== transitionPlan.parentPlanCommit ||
    parentPlanReviewEvidence.parentPlanPath !== transitionPlan.parentPlanPath ||
    parentPlanReviewEvidence.parentPlanRawSha256 !== transitionPlan.parentPlanRawSha256
  ) {
    errors.push("parent_review_plan_identity_mismatch");
  }

  if (
    parentPlanReviewEvidence.verdict !== "PASS" ||
    transitionIntent.parentReviewEvidenceId !== parentPlanReviewEvidence.id ||
    transitionIntent.parentReviewEvidenceDigest !== parentPlanReviewEvidence.digest
  ) {
    errors.push("parent_review_projection_mismatch");
  }

  return errors;
}

export function buildMissionReviewedTransitionGraphV1(input: unknown): MissionReviewedTransitionGraphBuildResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return invalidBuild("malformed_reviewed_transition_graph_input", "Reviewed transition graph input must be closed ordinary data.");
  }

  if (!exact(copied, INPUT_FIELDS)) {
    return invalidBuild("malformed_reviewed_transition_graph_input", "Reviewed transition graph input fields are not closed.");
  }

  const transitionPlanCheck = validateTransitionPlanV1({ artifact: copied.transitionPlan });
  if (transitionPlanCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...transitionPlanCheck.errors);
  }

  const reviewCheck = validateParentPlanReviewEvidenceV1({ artifact: copied.parentPlanReviewEvidence });
  if (reviewCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...reviewCheck.errors);
  }

  const intentCheck = validateTransitionIntentV1({ artifact: copied.transitionIntent });
  if (intentCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...intentCheck.errors);
  }

  const bindingErrors = identityBindingsMatch(transitionPlanCheck.value, reviewCheck.value, intentCheck.value);
  if (bindingErrors.length !== 0) {
    return invalidBuild("invalid_reviewed_transition_graph", ...bindingErrors);
  }

  const body = {
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none" as const,
    transitionPlan: transitionPlanCheck.value,
    parentPlanReviewEvidence: reviewCheck.value,
    transitionIntent: intentCheck.value,
  };

  const graphDigest = computeMissionReviewedTransitionGraphDigestV1(body);
  const graphId = computeMissionReviewedTransitionGraphIdV1(graphDigest);

  return { state: "built", graph: deepFreeze({ ...body, graphId, graphDigest } as MissionReviewedTransitionGraphV1) };
}

export function validateMissionReviewedTransitionGraphV1(input: unknown): MissionReviewedTransitionGraphValidationResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph must be closed ordinary data.");
  }

  if (!exact(copied, GRAPH_FIELDS)) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph fields are not closed.");
  }

  const candidate = copied as unknown as MissionReviewedTransitionGraphV1;
  if (candidate.schemaVersion !== 1 || candidate.schemaId !== MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID || candidate.authority !== "none") {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph header fields are invalid.");
  }

  if (!DIGEST.test(candidate.graphDigest) || !GRAPH_ID.test(candidate.graphId)) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph identity fields are invalid.");
  }

  const transitionPlanCheck = validateTransitionPlanV1({ artifact: candidate.transitionPlan });
  if (transitionPlanCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...transitionPlanCheck.errors);
  }

  const reviewCheck = validateParentPlanReviewEvidenceV1({ artifact: candidate.parentPlanReviewEvidence });
  if (reviewCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...reviewCheck.errors);
  }

  const intentCheck = validateTransitionIntentV1({ artifact: candidate.transitionIntent });
  if (intentCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...intentCheck.errors);
  }

  const bindingErrors = identityBindingsMatch(transitionPlanCheck.value, reviewCheck.value, intentCheck.value);
  if (bindingErrors.length > 0) {
    return invalidValidation("invalid_reviewed_transition_graph", ...bindingErrors);
  }

  const recomputedGraphDigest = computeMissionReviewedTransitionGraphDigestV1({
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none" as const,
    transitionPlan: transitionPlanCheck.value,
    parentPlanReviewEvidence: reviewCheck.value,
    transitionIntent: intentCheck.value,
  });
  if (recomputedGraphDigest !== candidate.graphDigest) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph digest is invalid.");
  }

  const recomputedGraphId = computeMissionReviewedTransitionGraphIdV1(recomputedGraphDigest);
  if (recomputedGraphId !== candidate.graphId) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph identity is invalid.");
  }

  return {
    state: "valid",
    value: deepFreeze({
      ...candidate,
      transitionPlan: transitionPlanCheck.value,
      parentPlanReviewEvidence: reviewCheck.value,
      transitionIntent: intentCheck.value,
    }),
  };
}
