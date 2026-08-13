import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const REVIEW_PUBLICATION_CONTRACT_VERSION = "review-publication.v1" as const;
export const REVIEW_PUBLICATION_AUTHORITY_KINDS = ["review.publish", "wheels_up"] as const;
export const REVIEW_PUBLICATION_EFFECTS = [
  "review.branch.push",
  "review.comment.publish",
  "review.pull_request.create_draft",
  "review.pull_request.update_draft",
] as const;
export const REVIEW_PUBLICATION_REASON_CODES = [
  "publication_scope_allowed",
  "authority_malformed",
  "proposal_malformed",
  "binding_mismatch",
  "observation_failed",
  "workspace_dirty",
  "path_unsafe",
  "path_sensitive",
  "path_ambiguous",
  "path_set_mismatch",
  "symlink_path_denied",
  "gitlink_path_denied",
  "effect_not_permitted",
] as const;

export type ReviewPublicationAuthorityKind = (typeof REVIEW_PUBLICATION_AUTHORITY_KINDS)[number];
export type ReviewPublicationEffect = (typeof REVIEW_PUBLICATION_EFFECTS)[number];
export type ReviewPublicationReasonCode = (typeof REVIEW_PUBLICATION_REASON_CODES)[number];

export interface ReviewPublicationAuthorityV1 {
  publicationScopeSchemaVersion: 1;
  contractVersion: "review-publication.v1";
  authorityKind: ReviewPublicationAuthorityKind;
  authorityRef: string;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  baseRevisionId: string;
  headRevisionId: string;
  authorizedPaths: string[];
  permittedEffects: ReviewPublicationEffect[];
}

export type ReviewPublicationAuthoritySemanticMaterialV1 = Readonly<{
  publicationScopeSchemaVersion: 1;
  contractVersion: "review-publication.v1";
  authorityKind: ReviewPublicationAuthorityKind;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  baseRevisionId: string;
  headRevisionId: string;
  authorizedPaths: readonly string[];
  permittedEffects: readonly ReviewPublicationEffect[];
}>;

export type ReviewPublicationAuthoritySemanticIdentityResultV1 =
  | Readonly<{
      state: "valid";
      semanticIdentity: string;
      material: ReviewPublicationAuthoritySemanticMaterialV1;
    }>
  | Readonly<{
      state: "blocked";
      reasonCode: Exclude<ReviewPublicationReasonCode, "publication_scope_allowed">;
    }>;

export interface ReviewPublicationProposalV1 {
  publicationScopeSchemaVersion: 1;
  contractVersion: "review-publication.v1";
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  baseRevisionId: string;
  headRevisionId: string;
  proposedChangedPaths: string[];
  observedChangedPaths: string[];
  requestedEffects: ReviewPublicationEffect[];
  observedSymlinkPaths: string[];
  observedGitlinkPaths: string[];
  workspaceClean: boolean;
}

export interface ReviewPublicationBindingV1 {
  authorityKind: ReviewPublicationAuthorityKind;
  authorityRef: string;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  repositoryId: string;
  canonicalRepositoryRoot: string;
  branch: string;
  baseRevisionId: string;
  headRevisionId: string;
  authorizedPaths: readonly string[];
  permittedEffects: readonly ReviewPublicationEffect[];
  requestedEffects: readonly ReviewPublicationEffect[];
}

export type ReviewPublicationEvaluationV1 =
  | {
      state: "allowed";
      reasonCode: "publication_scope_allowed";
      scopeDigest: string;
      binding: Readonly<ReviewPublicationBindingV1>;
    }
  | {
      state: "blocked";
      reasonCode: Exclude<ReviewPublicationReasonCode, "publication_scope_allowed">;
      scopeDigest: null;
    };

const AUTHORITY_FIELDS = [
  "publicationScopeSchemaVersion", "contractVersion", "authorityKind", "authorityRef",
  "missionId", "subjectId", "missionRevisionId", "repositoryId", "canonicalRepositoryRoot",
  "branch", "baseRevisionId", "headRevisionId", "authorizedPaths", "permittedEffects",
] as const;
const PROPOSAL_FIELDS = [
  "publicationScopeSchemaVersion", "contractVersion", "missionId", "subjectId",
  "missionRevisionId", "repositoryId", "canonicalRepositoryRoot", "branch",
  "baseRevisionId", "headRevisionId", "proposedChangedPaths", "observedChangedPaths",
  "requestedEffects", "observedSymlinkPaths", "observedGitlinkPaths", "workspaceClean",
] as const;
const BINDING_FIELDS = [
  "authorityKind", "authorityRef", "missionId", "subjectId", "missionRevisionId",
  "repositoryId", "canonicalRepositoryRoot", "branch", "baseRevisionId", "headRevisionId",
  "authorizedPaths", "permittedEffects", "requestedEffects",
] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const DENIED_SEGMENTS = new Set([".git", ".ssh", ".aws", ".gnupg", "credentials"]);
const DENIED_STEMS = new Set([
  ".env", "credentials", "token", "tokens", "auth", "authentication",
  "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
]);
const DENIED_EXTENSIONS = new Set(["pem", "key", "p12", "pfx"]);
const ALLOWED_EFFECTS = new Set<string>(REVIEW_PUBLICATION_EFFECTS);

function plain(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exactData(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (!plain(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
      fields.some((field) => !keys.includes(field)) ||
      keys.some((key) => !fields.includes(key as string))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set ||
        descriptor.enumerable !== true) return null;
    result[field] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, allowEmpty: boolean): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < (allowEmpty ? 0 : 1) || length > 256 ||
      Reflect.ownKeys(value).length !== length + 1) return null;
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set ||
        descriptor.enumerable !== true) return null;
    items.push(descriptor.value);
  }
  return items;
}

function fold(value: string): string {
  return value.normalize("NFKC").replace(/[A-Z\u017f\u212a]/gu, (character) => {
    if (character === "ſ") return "s";
    if (character === "K") return "k";
    return character.toLowerCase();
  });
}

export function isSensitiveReviewPublicationPath(value: unknown): boolean {
  if (typeof value !== "string") return true;
  for (const rawSegment of value.split("/")) {
    const segment = fold(rawSegment);
    if (DENIED_SEGMENTS.has(segment)) return true;
    for (const stem of DENIED_STEMS) {
      if (segment === stem || segment.startsWith(`${stem}.`)) return true;
    }
    const finalDot = segment.lastIndexOf(".");
    if (finalDot >= 0 && DENIED_EXTENSIONS.has(segment.slice(finalDot + 1))) return true;
  }
  return false;
}

function pathReason(value: unknown): "path_unsafe" | "path_sensitive" | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 ||
      value !== value.normalize("NFC") || value.startsWith("/") || value.includes("\\") ||
      CONTROL.test(value)) return "path_unsafe";
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return "path_unsafe";
  }
  return isSensitiveReviewPublicationPath(value) ? "path_sensitive" : null;
}

function checkedPaths(value: unknown, allowEmpty = false):
  { state: "valid"; paths: string[] } |
  { state: "invalid"; reasonCode: "path_unsafe" | "path_sensitive" | "path_ambiguous" } {
  const items = denseArray(value, allowEmpty);
  if (items === null || items.some((item) => typeof item !== "string")) {
    return { state: "invalid", reasonCode: "path_unsafe" };
  }
  const paths = items as string[];
  const folded = new Set<string>();
  for (let index = 0; index < paths.length; index += 1) {
    const reason = pathReason(paths[index]);
    if (reason !== null) return { state: "invalid", reasonCode: reason };
    if (index > 0 && paths[index - 1] >= paths[index]) {
      return { state: "invalid", reasonCode: "path_ambiguous" };
    }
    const identity = fold(paths[index]);
    if (folded.has(identity)) return { state: "invalid", reasonCode: "path_ambiguous" };
    folded.add(identity);
  }
  return { state: "valid", paths };
}

function checkedEffects(value: unknown, allowEmpty = false): ReviewPublicationEffect[] | null {
  const items = denseArray(value, allowEmpty);
  if (items === null || items.some((item) => typeof item !== "string" || !ALLOWED_EFFECTS.has(item))) {
    return null;
  }
  const effects = items as ReviewPublicationEffect[];
  for (let index = 1; index < effects.length; index += 1) {
    if (effects[index - 1] >= effects[index]) return null;
  }
  return effects;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function root(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && value.length <= 4096 &&
    !CONTROL.test(value) && !value.includes("\\") &&
    !value.split("/").some((segment, index) => index > 0 && (segment === "" || segment === "." || segment === ".."));
}

function revision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function scopeDigestForBinding(binding: ReviewPublicationBindingV1): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(binding)))
    .digest("base64url")}`;
}

export function computeReviewPublicationAuthorityDigest(
  authority: Readonly<ReviewPublicationAuthorityV1>,
): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(authority)))
    .digest("base64url")}`;
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const blocked = (
  reasonCode: Exclude<ReviewPublicationReasonCode, "publication_scope_allowed">,
): ReviewPublicationEvaluationV1 => ({ state: "blocked", reasonCode, scopeDigest: null });

export function validateReviewPublicationAuthorityV1(input: unknown):
  | { state: "valid"; value: Readonly<ReviewPublicationAuthorityV1> }
  | { state: "blocked"; reasonCode: Exclude<ReviewPublicationReasonCode, "publication_scope_allowed"> } {
  try {
    const authority = exactData(input, AUTHORITY_FIELDS);
    if (authority === null ||
        authority.publicationScopeSchemaVersion !== 1 ||
        authority.contractVersion !== REVIEW_PUBLICATION_CONTRACT_VERSION ||
        !REVIEW_PUBLICATION_AUTHORITY_KINDS.includes(authority.authorityKind as ReviewPublicationAuthorityKind) ||
        !identifier(authority.authorityRef) || !identifier(authority.missionId) ||
        !identifier(authority.subjectId) || !revision(authority.missionRevisionId) ||
        !identifier(authority.repositoryId) || !root(authority.canonicalRepositoryRoot) ||
        !identifier(authority.branch) || !revision(authority.baseRevisionId) ||
        !revision(authority.headRevisionId) || authority.baseRevisionId === authority.headRevisionId) {
      return { state: "blocked", reasonCode: "authority_malformed" };
    }
    const authorizedPaths = checkedPaths(authority.authorizedPaths);
    if (authorizedPaths.state === "invalid") {
      return { state: "blocked", reasonCode: authorizedPaths.reasonCode };
    }
    const permittedEffects = checkedEffects(authority.permittedEffects);
    if (permittedEffects === null) {
      return { state: "blocked", reasonCode: "authority_malformed" };
    }
    return {
      state: "valid",
      value: Object.freeze({
        publicationScopeSchemaVersion: 1,
        contractVersion: REVIEW_PUBLICATION_CONTRACT_VERSION,
        authorityKind: authority.authorityKind as ReviewPublicationAuthorityKind,
        authorityRef: authority.authorityRef as string,
        missionId: authority.missionId as string,
        subjectId: authority.subjectId as string,
        missionRevisionId: authority.missionRevisionId as string,
        repositoryId: authority.repositoryId as string,
        canonicalRepositoryRoot: authority.canonicalRepositoryRoot as string,
        branch: authority.branch as string,
        baseRevisionId: authority.baseRevisionId as string,
        headRevisionId: authority.headRevisionId as string,
        authorizedPaths: Object.freeze([...authorizedPaths.paths]) as unknown as string[],
        permittedEffects: Object.freeze([...permittedEffects]) as unknown as ReviewPublicationEffect[],
      }),
    };
  } catch {
    return { state: "blocked", reasonCode: "authority_malformed" };
  }
}

export function computeReviewPublicationAuthoritySemanticIdentityV1(
  input: unknown,
): ReviewPublicationAuthoritySemanticIdentityResultV1 {
  const checked = validateReviewPublicationAuthorityV1(input);
  if (checked.state === "blocked") return Object.freeze(checked);
  const authority = checked.value;
  const material: ReviewPublicationAuthoritySemanticMaterialV1 = Object.freeze({
    publicationScopeSchemaVersion: authority.publicationScopeSchemaVersion,
    contractVersion: authority.contractVersion,
    authorityKind: authority.authorityKind,
    missionId: authority.missionId,
    subjectId: authority.subjectId,
    missionRevisionId: authority.missionRevisionId,
    repositoryId: authority.repositoryId,
    canonicalRepositoryRoot: authority.canonicalRepositoryRoot,
    branch: authority.branch,
    baseRevisionId: authority.baseRevisionId,
    headRevisionId: authority.headRevisionId,
    authorizedPaths: Object.freeze([...authority.authorizedPaths]),
    permittedEffects: Object.freeze([...authority.permittedEffects]),
  });
  const semanticIdentity = `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(material)))
    .digest("base64url")}`;
  return Object.freeze({ state: "valid", semanticIdentity, material });
}

export function validateReviewPublicationEvidenceV1(input: unknown):
  | { state: "valid"; scopeDigest: string; binding: Readonly<ReviewPublicationBindingV1> }
  | { state: "blocked"; reasonCode: "proposal_malformed" | "path_unsafe" | "path_sensitive" | "path_ambiguous" } {
  try {
    const outer = exactData(input, ["scopeDigest", "binding"]);
    const binding = outer === null ? null : exactData(outer.binding, BINDING_FIELDS);
    if (outer === null || binding === null ||
        typeof outer.scopeDigest !== "string" ||
        !REVIEW_PUBLICATION_AUTHORITY_KINDS.includes(binding.authorityKind as ReviewPublicationAuthorityKind) ||
        !identifier(binding.authorityRef) || !identifier(binding.missionId) ||
        !identifier(binding.subjectId) || !revision(binding.missionRevisionId) ||
        !identifier(binding.repositoryId) || !root(binding.canonicalRepositoryRoot) ||
        !identifier(binding.branch) || !revision(binding.baseRevisionId) ||
        !revision(binding.headRevisionId)) {
      return { state: "blocked", reasonCode: "proposal_malformed" };
    }
    const authorizedPaths = checkedPaths(binding.authorizedPaths);
    if (authorizedPaths.state === "invalid") return { state: "blocked", reasonCode: authorizedPaths.reasonCode };
    const permittedEffects = checkedEffects(binding.permittedEffects);
    const requestedEffects = checkedEffects(binding.requestedEffects);
    if (permittedEffects === null || requestedEffects === null ||
        requestedEffects.some((effect) => !permittedEffects.includes(effect))) {
      return { state: "blocked", reasonCode: "proposal_malformed" };
    }
    const normalized: ReviewPublicationBindingV1 = {
      authorityKind: binding.authorityKind as ReviewPublicationAuthorityKind,
      authorityRef: binding.authorityRef as string,
      missionId: binding.missionId as string,
      subjectId: binding.subjectId as string,
      missionRevisionId: binding.missionRevisionId as string,
      repositoryId: binding.repositoryId as string,
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot as string,
      branch: binding.branch as string,
      baseRevisionId: binding.baseRevisionId as string,
      headRevisionId: binding.headRevisionId as string,
      authorizedPaths: Object.freeze([...authorizedPaths.paths]),
      permittedEffects: Object.freeze([...permittedEffects]),
      requestedEffects: Object.freeze([...requestedEffects]),
    };
    const expected = scopeDigestForBinding(normalized);
    if (outer.scopeDigest !== expected) return { state: "blocked", reasonCode: "proposal_malformed" };
    return { state: "valid", scopeDigest: expected, binding: Object.freeze(normalized) };
  } catch {
    return { state: "blocked", reasonCode: "proposal_malformed" };
  }
}

export function evaluateReviewPublicationV1(
  authorityInput: unknown,
  proposalInput: unknown,
): ReviewPublicationEvaluationV1 {
  try {
    const checkedAuthority = validateReviewPublicationAuthorityV1(authorityInput);
    if (checkedAuthority.state === "blocked") return blocked(checkedAuthority.reasonCode);
    const authority = checkedAuthority.value;
    const authorizedPaths = authority.authorizedPaths;
    const permittedEffects = authority.permittedEffects;

    const proposal = exactData(proposalInput, PROPOSAL_FIELDS);
    if (proposal === null ||
        proposal.publicationScopeSchemaVersion !== 1 ||
        proposal.contractVersion !== REVIEW_PUBLICATION_CONTRACT_VERSION ||
        !identifier(proposal.missionId) || !identifier(proposal.subjectId) ||
        !revision(proposal.missionRevisionId) || !identifier(proposal.repositoryId) ||
        !root(proposal.canonicalRepositoryRoot) || !identifier(proposal.branch) ||
        !revision(proposal.baseRevisionId) || !revision(proposal.headRevisionId) ||
        typeof proposal.workspaceClean !== "boolean") {
      return blocked("proposal_malformed");
    }
    const proposedPaths = checkedPaths(proposal.proposedChangedPaths);
    const observedPaths = checkedPaths(proposal.observedChangedPaths);
    const symlinkPaths = checkedPaths(proposal.observedSymlinkPaths, true);
    const gitlinkPaths = checkedPaths(proposal.observedGitlinkPaths, true);
    const requestedEffects = checkedEffects(proposal.requestedEffects);
    if (proposedPaths.state === "invalid") return blocked(proposedPaths.reasonCode);
    if (observedPaths.state === "invalid") return blocked(observedPaths.reasonCode);
    if (symlinkPaths.state === "invalid") return blocked(symlinkPaths.reasonCode);
    if (gitlinkPaths.state === "invalid") return blocked(gitlinkPaths.reasonCode);
    if (requestedEffects === null) return blocked("proposal_malformed");

    for (const field of [
      "missionId", "subjectId", "missionRevisionId", "repositoryId", "canonicalRepositoryRoot",
      "branch", "baseRevisionId", "headRevisionId",
    ] as const) {
      if (authority[field] !== proposal[field]) return blocked("binding_mismatch");
    }
    if (proposal.workspaceClean !== true) return blocked("workspace_dirty");
    if (symlinkPaths.paths.length > 0) return blocked("symlink_path_denied");
    if (gitlinkPaths.paths.length > 0) return blocked("gitlink_path_denied");
    if (!equalSets(authorizedPaths, proposedPaths.paths) ||
        !equalSets(authorizedPaths, observedPaths.paths)) return blocked("path_set_mismatch");
    if (requestedEffects.some((effect) => !permittedEffects.includes(effect))) {
      return blocked("effect_not_permitted");
    }

    const binding: ReviewPublicationBindingV1 = {
      authorityKind: authority.authorityKind,
      authorityRef: authority.authorityRef,
      missionId: authority.missionId,
      subjectId: authority.subjectId,
      missionRevisionId: authority.missionRevisionId,
      repositoryId: authority.repositoryId,
      canonicalRepositoryRoot: authority.canonicalRepositoryRoot,
      branch: authority.branch,
      baseRevisionId: authority.baseRevisionId,
      headRevisionId: authority.headRevisionId,
      authorizedPaths: Object.freeze([...authorizedPaths]),
      permittedEffects: Object.freeze([...permittedEffects]),
      requestedEffects: Object.freeze([...requestedEffects]),
    };
    const scopeDigest = scopeDigestForBinding(binding);
    return {
      state: "allowed",
      reasonCode: "publication_scope_allowed",
      scopeDigest,
      binding: Object.freeze(binding),
    };
  } catch {
    return blocked("proposal_malformed");
  }
}
