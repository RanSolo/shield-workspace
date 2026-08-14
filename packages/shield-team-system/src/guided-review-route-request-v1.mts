import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { isProxy } from "node:util/types";

import {
  BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1,
  type GuidedReviewBuiltInTemplateV1,
} from "./guided-review-playbooks-v1.mjs";
import {
  validateGuidedReviewPlanV1,
  validateGuidedReviewRuntimeHandoffV1,
  type GuidedReviewCriterionV1,
  type GuidedReviewParticipantRelationshipV1,
  type GuidedReviewPlanV1,
  type GuidedReviewRuntimeHandoffV1,
} from "./guided-review-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_ROUTE_REQUEST_CONTRACT_VERSION = "guided.review.route-request.v1" as const;
export const GUIDED_REVIEW_ROUTE_PACKAGE_FILENAMES_V1 = Object.freeze({
  routeRequest: "route-request.json",
  routeOverlay: "route-overlay.json",
  playbook: "playbook.json",
  session: "session.json",
});

export interface GuidedReviewRouteRequestInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_ROUTE_REQUEST_CONTRACT_VERSION;
  readonly authority: "none";
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly exactRevision: string;
  readonly protectedGraphId: string;
  readonly protectedGraphDigest: string;
  readonly transitionPlanId: string;
  readonly transitionPlanDigest: string;
  readonly parentPlanReviewEvidenceId: string;
  readonly parentPlanReviewEvidenceDigest: string;
  readonly policyMode: "required" | "operator_optional" | "omitted";
  readonly templateId: GuidedReviewBuiltInTemplateV1["templateId"];
  readonly templateVersion: "1";
  readonly templateDigest: string;
  readonly templateRouteGraphDigest: string;
  readonly kind: GuidedReviewBuiltInTemplateV1["kind"];
  readonly plan: GuidedReviewPlanV1;
  readonly acceptanceCriteria: readonly GuidedReviewCriterionV1[];
  readonly runtimeHandoff: GuidedReviewRuntimeHandoffV1;
  readonly participantRelationship: GuidedReviewParticipantRelationshipV1;
}

export interface GuidedReviewRouteRequestV1 extends GuidedReviewRouteRequestInputV1 {
  readonly requestId: string;
  readonly requestDigest: string;
}

export interface GuidedReviewRoutePackagePathsV1 {
  readonly contentId: string;
  readonly packageDirectory: string;
  readonly routeRequestPath: string;
  readonly routeOverlayPath: string;
  readonly playbookPath: string;
  readonly sessionPath: string;
}

export interface DiscoveredGuidedReviewRouteRequestV1 {
  readonly request: GuidedReviewRouteRequestV1;
  readonly paths: GuidedReviewRoutePackagePathsV1;
}

export interface GuidedReviewRoutePackageArtifactMaterializationV1 {
  readonly paths: GuidedReviewRoutePackagePathsV1;
  readonly disposition: "created" | "already_exists_exact";
}

export type GuidedReviewRouteRequestResultV1<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const CONTENT_ID = /^[A-Za-z0-9_-]{43}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const INPUT_FIELDS = ["schemaVersion", "contractVersion", "authority", "missionId", "missionRevisionId", "subjectId", "repositoryId", "branch", "exactRevision",
  "protectedGraphId", "protectedGraphDigest", "transitionPlanId", "transitionPlanDigest", "parentPlanReviewEvidenceId", "parentPlanReviewEvidenceDigest", "policyMode",
  "templateId", "templateVersion", "templateDigest", "templateRouteGraphDigest", "kind", "plan", "acceptanceCriteria", "runtimeHandoff", "participantRelationship"] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function digestValue(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function text(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;
}
function hash(value: unknown): string { return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`; }
function snapshot<T>(value: T): T {
  const output = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(output);
  return output;
}
function invalid<T>(code: string, error: string): GuidedReviewRouteRequestResultV1<T> {
  return { state: "invalid", code, errors: Object.freeze([error]) };
}
function requestId(requestDigest: string): string { return `guided-review-route-request:${requestDigest.slice("sha256:".length)}`; }
function contentId(request: GuidedReviewRouteRequestV1): string { return request.requestDigest.slice("sha256:".length); }

function validCriterion(value: unknown): value is GuidedReviewCriterionV1 {
  return exact(value, ["criterionId", "text"]) && id(value.criterionId) && text(value.text);
}

function validInput(value: unknown): value is GuidedReviewRouteRequestInputV1 {
  if (!exact(value, INPUT_FIELDS) || value.schemaVersion !== 1 || value.contractVersion !== GUIDED_REVIEW_ROUTE_REQUEST_CONTRACT_VERSION || value.authority !== "none" ||
      !id(value.missionId) || !id(value.missionRevisionId) || !id(value.subjectId) || typeof value.repositoryId !== "string" || !REPOSITORY.test(value.repositoryId) ||
      !id(value.branch) || typeof value.exactRevision !== "string" || !REVISION.test(value.exactRevision) || !id(value.protectedGraphId) || !digestValue(value.protectedGraphDigest) ||
      !id(value.transitionPlanId) || !digestValue(value.transitionPlanDigest) || !id(value.parentPlanReviewEvidenceId) || !digestValue(value.parentPlanReviewEvidenceDigest) ||
      !["required", "operator_optional", "omitted"].includes(value.policyMode as string) || !id(value.templateId) || value.templateVersion !== "1" ||
      !digestValue(value.templateDigest) || !digestValue(value.templateRouteGraphDigest) || !["backend", "frontend", "spike"].includes(value.kind as string) ||
      !Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0 || value.acceptanceCriteria.length > 256 ||
      !value.acceptanceCriteria.every(validCriterion) || new Set(value.acceptanceCriteria.map((criterion) => criterion.criterionId)).size !== value.acceptanceCriteria.length ||
      !["builder", "independent_reviewer", "product_reviewer", "document_reviewer"].includes(value.participantRelationship as string)) return false;
  const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find((entry) => entry.templateId === value.templateId && entry.templateVersion === value.templateVersion &&
    entry.templateDigest === value.templateDigest && entry.routeGraphDigest === value.templateRouteGraphDigest && entry.kind === value.kind);
  const plan = validateGuidedReviewPlanV1(value.plan);
  const runtime = validateGuidedReviewRuntimeHandoffV1(value.runtimeHandoff);
  if (template === undefined || plan.state !== "ready" || runtime.state !== "ready") return false;
  const criteria = new Set(value.acceptanceCriteria.map((criterion) => criterion.criterionId));
  return plan.value.missionId === value.missionId && plan.value.subjectId === value.subjectId && plan.value.exactRevision === value.exactRevision &&
    plan.value.kind === value.kind && plan.value.participantRelationship === value.participantRelationship &&
    plan.value.required === (value.policyMode === "required") && plan.value.coveredCriterionRefs.every((criterion) => criteria.has(criterion)) &&
    runtime.value.repositoryId === value.repositoryId && runtime.value.branch === value.branch && runtime.value.exactRevision === value.exactRevision;
}

export function createGuidedReviewRouteRequestV1(input: unknown): GuidedReviewRouteRequestResultV1<GuidedReviewRouteRequestV1> {
  if (!validInput(input)) return invalid("MALFORMED_ROUTE_REQUEST", "Guided Review route request is malformed, open, unpinned, or cross-bound.");
  const body = snapshot(input);
  const requestDigest = hash(body);
  return { state: "ready", value: snapshot({ ...body, requestId: requestId(requestDigest), requestDigest }) };
}

export function validateGuidedReviewRouteRequestV1(input: unknown): GuidedReviewRouteRequestResultV1<GuidedReviewRouteRequestV1> {
  if (!exact(input, [...INPUT_FIELDS, "requestId", "requestDigest"]) || !digestValue(input.requestDigest) || !id(input.requestId)) {
    return invalid("MALFORMED_ROUTE_REQUEST", "Guided Review route request shape or content identity is malformed.");
  }
  const { requestId: candidateId, requestDigest, ...body } = input;
  return validInput(body) && hash(body) === requestDigest && candidateId === requestId(requestDigest)
    ? { state: "ready", value: snapshot(input as unknown as GuidedReviewRouteRequestV1) }
    : invalid("MALFORMED_ROUTE_REQUEST", "Guided Review route request digest, derived ID, or binding is invalid.");
}

function packagePaths(root: string, idValue: string): GuidedReviewRoutePackagePathsV1 {
  const packageDirectory = join(root, ".shield", "tmp", "guided-review", idValue);
  return snapshot({ contentId: idValue, packageDirectory,
    routeRequestPath: join(packageDirectory, GUIDED_REVIEW_ROUTE_PACKAGE_FILENAMES_V1.routeRequest),
    routeOverlayPath: join(packageDirectory, GUIDED_REVIEW_ROUTE_PACKAGE_FILENAMES_V1.routeOverlay),
    playbookPath: join(packageDirectory, GUIDED_REVIEW_ROUTE_PACKAGE_FILENAMES_V1.playbook),
    sessionPath: join(packageDirectory, GUIDED_REVIEW_ROUTE_PACKAGE_FILENAMES_V1.session) });
}

async function realWorkspaceRoot(workspaceRoot: string): Promise<string> {
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0 || !isAbsolute(workspaceRoot)) throw new Error("workspace_root_invalid");
  const root = await realpath(resolve(workspaceRoot));
  const handle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { if (!(await handle.stat()).isDirectory()) throw new Error("workspace_root_invalid"); } finally { await handle.close(); }
  return root;
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { if (!(await handle.stat()).isDirectory()) throw new Error("package_directory_invalid"); await handle.sync(); }
  finally { await handle.close(); }
}

async function ensureDirectories(root: string, segments: readonly string[]): Promise<string> {
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const handle = await open(current, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { if (!(await handle.stat()).isDirectory()) throw new Error("package_directory_invalid"); } finally { await handle.close(); }
    if (await realpath(current) !== current) throw new Error("package_directory_not_real");
  }
  return current;
}

async function secureRead(path: string): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size < 1 || before.size > MAX_REQUEST_BYTES) {
    throw new Error("request_file_invalid");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error("request_file_changed");
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== 1 ||
        pathAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.dev !== opened.dev || pathAfter.ino !== opened.ino ||
        pathAfter.nlink !== 1 || pathAfter.size !== opened.size || (pathAfter.mode & 0o777) !== 0o600) throw new Error("request_file_changed");
    return bytes;
  } finally { await handle.close(); }
}

export async function resolveGuidedReviewRoutePackagePathsV1(workspaceRoot: string, requestInput: unknown): Promise<GuidedReviewRouteRequestResultV1<GuidedReviewRoutePackagePathsV1>> {
  const request = validateGuidedReviewRouteRequestV1(requestInput);
  if (request.state !== "ready") return request;
  try { return { state: "ready", value: packagePaths(await realWorkspaceRoot(workspaceRoot), contentId(request.value)) }; }
  catch { return invalid("PACKAGE_PATH_INVALID", "Guided Review package paths could not be resolved beneath a real workspace root."); }
}

export async function materializeGuidedReviewRouteRequestV1(workspaceRoot: string, requestInput: unknown): Promise<GuidedReviewRouteRequestResultV1<GuidedReviewRoutePackagePathsV1>> {
  const request = validateGuidedReviewRouteRequestV1(requestInput);
  if (request.state !== "ready") return request;
  const bytes = canonicalJson(request.value);
  let created: { path: string; dev: number | bigint; ino: number | bigint } | null = null;
  try {
    const root = await realWorkspaceRoot(workspaceRoot);
    const idValue = contentId(request.value);
    await ensureDirectories(root, [".shield", "tmp", "guided-review", idValue]);
    const paths = packagePaths(root, idValue);
    let handle: FileHandle | null = null;
    try {
      handle = await open(paths.routeRequestPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await secureRead(paths.routeRequestPath);
      const left = Buffer.from(existing); const right = Buffer.from(bytes);
      if (left.length !== right.length || !timingSafeEqual(left, right)) return invalid("REQUEST_ALREADY_EXISTS", "Existing route request bytes differ; overwrite is forbidden.");
      return { state: "ready", value: paths };
    }
    try {
      await handle.chmod(0o600);
      const opened = await handle.stat();
      created = { path: paths.routeRequestPath, dev: opened.dev, ino: opened.ino };
      if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o777) !== 0o600) throw new Error("request_file_invalid");
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
      const written = await handle.stat();
      if (written.dev !== opened.dev || written.ino !== opened.ino || written.nlink !== 1 || written.size !== Buffer.byteLength(bytes)) throw new Error("request_file_changed");
    } finally { await handle.close(); }
    await syncDirectory(paths.packageDirectory);
    await syncDirectory(join(root, ".shield", "tmp", "guided-review"));
    if (await secureRead(paths.routeRequestPath) !== bytes) throw new Error("request_readback_mismatch");
    return { state: "ready", value: paths };
  } catch {
    if (created !== null) {
      const owned = await lstat(created.path).catch(() => null);
      if (owned?.isFile() && !owned.isSymbolicLink() && owned.nlink === 1 && owned.dev === created.dev && owned.ino === created.ino) await unlink(created.path).catch(() => undefined);
    }
    return invalid("REQUEST_MATERIALIZATION_FAILED", "Guided Review route request could not be materialized securely.");
  }
}

export async function readGuidedReviewRouteRequestV1(workspaceRoot: string, contentIdInput: string): Promise<GuidedReviewRouteRequestResultV1<GuidedReviewRouteRequestV1>> {
  if (typeof contentIdInput !== "string" || !CONTENT_ID.test(contentIdInput)) return invalid("CONTENT_ID_INVALID", "Guided Review route request content ID is malformed.");
  try {
    const root = await realWorkspaceRoot(workspaceRoot);
    const directory = join(root, ".shield", "tmp", "guided-review", contentIdInput);
    if (await realpath(directory) !== directory) throw new Error("package_directory_not_real");
    const bytes = await secureRead(packagePaths(root, contentIdInput).routeRequestPath);
    const parsed = JSON.parse(bytes) as unknown;
    const request = validateGuidedReviewRouteRequestV1(parsed);
    if (request.state !== "ready" || contentId(request.value) !== contentIdInput || bytes !== canonicalJson(request.value)) {
      return invalid("REQUEST_READBACK_INVALID", "Stored route request bytes or content identity are invalid.");
    }
    return request;
  } catch { return invalid("REQUEST_READBACK_FAILED", "Guided Review route request could not be read securely."); }
}

export async function discoverGuidedReviewRouteRequestsV1(workspaceRoot: string): Promise<GuidedReviewRouteRequestResultV1<readonly DiscoveredGuidedReviewRouteRequestV1[]>> {
  try {
    const root = await realWorkspaceRoot(workspaceRoot);
    const packagesRoot = join(root, ".shield", "tmp", "guided-review");
    try { if (await realpath(packagesRoot) !== packagesRoot) throw new Error("package_directory_not_real"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "ready", value: Object.freeze([]) };
      throw error;
    }
    const entries = await readdir(packagesRoot, { withFileTypes: true });
    const discovered: DiscoveredGuidedReviewRouteRequestV1[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!CONTENT_ID.test(entry.name)) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("package_directory_invalid");
      const request = await readGuidedReviewRouteRequestV1(root, entry.name);
      if (request.state !== "ready") return request;
      discovered.push(snapshot({ request: request.value, paths: packagePaths(root, entry.name) }));
    }
    return { state: "ready", value: snapshot(discovered) };
  } catch { return invalid("REQUEST_DISCOVERY_FAILED", "Guided Review route requests could not be discovered securely."); }
}

export async function readGuidedReviewRoutePackageJsonV1(
  workspaceRoot: string,
  requestInput: unknown,
  artifact: "routeOverlay" | "playbook" | "session",
): Promise<GuidedReviewRouteRequestResultV1<unknown>> {
  const request = validateGuidedReviewRouteRequestV1(requestInput);
  if (request.state !== "ready") return request;
  try {
    const root = await realWorkspaceRoot(workspaceRoot);
    const paths = packagePaths(root, contentId(request.value));
    if (await realpath(paths.packageDirectory) !== paths.packageDirectory) throw new Error("package_directory_not_real");
    const path = artifact === "routeOverlay" ? paths.routeOverlayPath : artifact === "playbook" ? paths.playbookPath : paths.sessionPath;
    const bytes = await secureRead(path);
    const parsed = JSON.parse(bytes) as unknown;
    if (bytes !== canonicalJson(parsed)) return invalid("PACKAGE_ARTIFACT_NONCANONICAL", "Guided Review package artifact bytes are not canonical JSON.");
    return { state: "ready", value: snapshot(parsed) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return invalid("PACKAGE_ARTIFACT_MISSING", "Guided Review package artifact is not materialized yet.");
    return invalid("PACKAGE_ARTIFACT_READ_FAILED", "Guided Review package artifact could not be read securely.");
  }
}

export async function materializeGuidedReviewRoutePackageJsonV1(
  workspaceRoot: string,
  requestInput: unknown,
  artifact: "playbook" | "session",
  value: unknown,
  mode: "idempotent_exact" | "exclusive",
): Promise<GuidedReviewRouteRequestResultV1<GuidedReviewRoutePackageArtifactMaterializationV1>> {
  const request = validateGuidedReviewRouteRequestV1(requestInput);
  if (request.state !== "ready") return request;
  let bytes: string;
  try {
    bytes = canonicalJson(value);
    if (bytes.length === 0 || Buffer.byteLength(bytes) > MAX_REQUEST_BYTES || canonicalJson(JSON.parse(bytes) as unknown) !== bytes) {
      return invalid("PACKAGE_ARTIFACT_INVALID", "Guided Review package artifact is not bounded canonical JSON.");
    }
  } catch { return invalid("PACKAGE_ARTIFACT_INVALID", "Guided Review package artifact cannot be represented as canonical JSON."); }
  let created: { path: string; dev: number | bigint; ino: number | bigint } | null = null;
  try {
    const root = await realWorkspaceRoot(workspaceRoot);
    const paths = packagePaths(root, contentId(request.value));
    if (await realpath(paths.packageDirectory) !== paths.packageDirectory) throw new Error("package_directory_not_real");
    const path = artifact === "playbook" ? paths.playbookPath : paths.sessionPath;
    let handle: FileHandle;
    try { handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (mode === "exclusive") return invalid("PACKAGE_ARTIFACT_ALREADY_EXISTS", "Guided Review package artifact already exists; overwrite is forbidden.");
      const existing = await secureRead(path);
      const left = Buffer.from(existing); const right = Buffer.from(bytes);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        return invalid("PACKAGE_ARTIFACT_CONFLICT", "Existing Guided Review package artifact differs; overwrite is forbidden.");
      }
      return { state: "ready", value: snapshot({ paths, disposition: "already_exists_exact" }) };
    }
    try {
      await handle.chmod(0o600);
      const opened = await handle.stat();
      created = { path, dev: opened.dev, ino: opened.ino };
      if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o777) !== 0o600) throw new Error("artifact_file_invalid");
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
      const written = await handle.stat();
      if (written.dev !== opened.dev || written.ino !== opened.ino || written.nlink !== 1 || written.size !== Buffer.byteLength(bytes)) {
        throw new Error("artifact_file_changed");
      }
    } finally { await handle.close(); }
    await syncDirectory(paths.packageDirectory);
    if (await secureRead(path) !== bytes) throw new Error("artifact_readback_mismatch");
    return { state: "ready", value: snapshot({ paths, disposition: "created" }) };
  } catch {
    if (created !== null) {
      const owned = await lstat(created.path).catch(() => null);
      if (owned?.isFile() && !owned.isSymbolicLink() && owned.nlink === 1 && owned.dev === created.dev && owned.ino === created.ino) {
        await unlink(created.path).catch(() => undefined);
      }
    }
    return invalid("PACKAGE_ARTIFACT_MATERIALIZATION_FAILED", "Guided Review package artifact could not be materialized securely.");
  }
}
