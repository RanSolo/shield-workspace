import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_PROJECTION_CONTRACT_VERSION = "guided.review.projection.v1" as const;

export interface GuidedReviewProjectionLineRangeV1 {
  readonly start: number;
  readonly lines: number;
}

export interface GuidedReviewProjectionTargetV1 {
  readonly targetType: "local_diff" | "evidence";
  readonly relativePath: string;
  readonly oldRange: GuidedReviewProjectionLineRangeV1;
  readonly newRange: GuidedReviewProjectionLineRangeV1;
  readonly excerpts: Readonly<{ before: readonly string[]; focus: readonly string[]; after: readonly string[] }>;
  readonly navigation: Readonly<{ executor: "git"; argv: readonly string[] }>;
}

export interface GuidedReviewProjectionBehaviorGroupV1 {
  readonly behaviorGroupId: string;
  readonly title: string;
  readonly instructions: readonly string[];
  readonly rationale: string;
  readonly targets: readonly GuidedReviewProjectionTargetV1[];
}

export interface GuidedReviewProjectionInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_PROJECTION_CONTRACT_VERSION;
  readonly authority: "none";
  readonly durability: "ephemeral";
  readonly missionId: string;
  readonly repositoryId: string;
  readonly canonicalRoot: string;
  readonly branch: string;
  readonly planningBaseRevision: string;
  readonly reviewBaseRevision: string;
  readonly exactRevision: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly compiledRouteDigest: string;
  readonly overlayId: string;
  readonly overlayDigest: string;
  readonly playbookDigest: string;
  readonly sessionId: string;
  readonly sessionDigest: string;
  readonly stageId: string;
  readonly checkpointId: string;
  readonly stepId: string;
  readonly behaviorGroups: readonly GuidedReviewProjectionBehaviorGroupV1[];
}

export interface GuidedReviewProjectionV1 extends GuidedReviewProjectionInputV1 {
  readonly projectionDigest: string;
}

export type GuidedReviewProjectionResultV1<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const INPUT_FIELDS = ["schemaVersion", "contractVersion", "authority", "durability", "missionId", "repositoryId", "canonicalRoot", "branch",
  "planningBaseRevision", "reviewBaseRevision", "exactRevision", "requestId", "requestDigest", "compiledRouteDigest", "overlayId", "overlayDigest",
  "playbookDigest", "sessionId", "sessionDigest", "stageId", "checkpointId", "stepId", "behaviorGroups"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/@# +:=,-]+$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum && !value.includes("\u0000");
}
function strings(value: unknown, maximumEntries: number, maximumLength: number, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= maximumEntries && value.every((entry) =>
    typeof entry === "string" && entry.length <= maximumLength && !entry.includes("\u0000"));
}
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
function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}
function invalid<T>(): GuidedReviewProjectionResultV1<T> {
  return Object.freeze({ state: "invalid", code: "MALFORMED_GUIDED_REVIEW_PROJECTION",
    errors: Object.freeze(["Guided Review projection is open, unbounded, hostile, noncanonical, or cross-bound."]) });
}
function range(value: unknown): value is GuidedReviewProjectionLineRangeV1 {
  return exact(value, ["start", "lines"]) && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.lines) &&
    (value.start as number) >= 0 && (value.lines as number) >= 0 && (value.start as number) <= 10_000_000 && (value.lines as number) <= 10_000;
}
function target(value: unknown, reviewBase: string, exactRevision: string): value is GuidedReviewProjectionTargetV1 {
  if (!exact(value, ["targetType", "relativePath", "oldRange", "newRange", "excerpts", "navigation"]) ||
      !["local_diff", "evidence"].includes(value.targetType as string) || typeof value.relativePath !== "string" || value.relativePath.length > 512 ||
      !SAFE_PATH.test(value.relativePath) || !range(value.oldRange) || !range(value.newRange) ||
      !exact(value.excerpts, ["before", "focus", "after"]) || !strings(value.excerpts.before, 20, 500) ||
      !strings(value.excerpts.focus, 20, 500) || !strings(value.excerpts.after, 20, 500) ||
      !exact(value.navigation, ["executor", "argv"]) || value.navigation.executor !== "git" || !strings(value.navigation.argv, 16, 600, false)) return false;
  const expected = ["diff", "--no-ext-diff", "--no-renames", "--unified=3", reviewBase, exactRevision, "--", `:(top,literal)${value.relativePath}`];
  return canonicalJson(value.navigation.argv) === canonicalJson(expected);
}
function group(value: unknown, reviewBase: string, exactRevision: string): value is GuidedReviewProjectionBehaviorGroupV1 {
  return exact(value, ["behaviorGroupId", "title", "instructions", "rationale", "targets"]) && id(value.behaviorGroupId) && text(value.title, 200) &&
    strings(value.instructions, 32, 2000, false) && value.instructions.every((entry) => text(entry, 2000)) && text(value.rationale, 4000) &&
    Array.isArray(value.targets) && value.targets.length > 0 && value.targets.length <= 64 &&
    value.targets.every((entry) => target(entry, reviewBase, exactRevision)) &&
    new Set(value.targets.map((entry) => `${entry.targetType}:${entry.relativePath}`)).size === value.targets.length;
}
function validInput(value: unknown): value is GuidedReviewProjectionInputV1 {
  if (!exact(value, INPUT_FIELDS) || value.schemaVersion !== 1 || value.contractVersion !== GUIDED_REVIEW_PROJECTION_CONTRACT_VERSION ||
      value.authority !== "none" || value.durability !== "ephemeral" || !id(value.missionId) || typeof value.repositoryId !== "string" ||
      !REPOSITORY.test(value.repositoryId) || typeof value.canonicalRoot !== "string" || !isAbsolute(value.canonicalRoot) || value.canonicalRoot.includes("\u0000") ||
      !id(value.branch) || !REVISION.test(value.planningBaseRevision as string) || !REVISION.test(value.reviewBaseRevision as string) ||
      !REVISION.test(value.exactRevision as string) || !id(value.requestId) || !DIGEST.test(value.requestDigest as string) ||
      !DIGEST.test(value.compiledRouteDigest as string) || !id(value.overlayId) || !DIGEST.test(value.overlayDigest as string) ||
      !DIGEST.test(value.playbookDigest as string) || !id(value.sessionId) || !DIGEST.test(value.sessionDigest as string) ||
      !id(value.stageId) || !id(value.checkpointId) || !id(value.stepId) || !Array.isArray(value.behaviorGroups) ||
      value.behaviorGroups.length === 0 || value.behaviorGroups.length > 64 ||
      !value.behaviorGroups.every((entry) => group(entry, value.reviewBaseRevision as string, value.exactRevision as string))) return false;
  return new Set(value.behaviorGroups.map((entry) => entry.behaviorGroupId)).size === value.behaviorGroups.length;
}
function normalized(value: GuidedReviewProjectionInputV1): GuidedReviewProjectionInputV1 {
  return snapshot({ ...value, behaviorGroups: [...value.behaviorGroups].map((entry) => ({ ...entry,
    targets: [...entry.targets].sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.targetType.localeCompare(right.targetType)),
  })).sort((left, right) => left.behaviorGroupId.localeCompare(right.behaviorGroupId)) });
}

export function createGuidedReviewProjectionV1(input: unknown): GuidedReviewProjectionResultV1<GuidedReviewProjectionV1> {
  if (!validInput(input)) return invalid();
  const body = normalized(input);
  return Object.freeze({ state: "ready", value: snapshot({ ...body, projectionDigest: digest(body) }) });
}

export function validateGuidedReviewProjectionV1(input: unknown): GuidedReviewProjectionResultV1<GuidedReviewProjectionV1> {
  if (!plain(input) || !DIGEST.test(input.projectionDigest as string)) return invalid();
  const { projectionDigest, ...body } = input;
  const created = createGuidedReviewProjectionV1(body);
  return created.state === "ready" && projectionDigest === created.value.projectionDigest && canonicalJson(input) === canonicalJson(created.value)
    ? created : invalid();
}
