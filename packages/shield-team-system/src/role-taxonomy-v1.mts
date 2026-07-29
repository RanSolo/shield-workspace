export const ROLE_TAXONOMY_SCHEMA_VERSION = 1 as const;
export const ROLE_TAXONOMY_CONTRACT_VERSION = "roles.v1" as const;

export type RoleKind = "dispatchable_seat" | "human_gate";
export type RoleRoute = "dispatch_seat" | "wait_for_human_gate";
export type RoleAssignmentScope =
  | "dispatch"
  | "model"
  | "reasoning_runtime"
  | "tool_executor"
  | "tool";

const ASSIGNMENT_SCOPES = [
  "dispatch",
  "model",
  "reasoning_runtime",
  "tool_executor",
  "tool",
] as const;

export const CANONICAL_ROLE_IDS = [
  "hill",
  "daisy",
  "fury",
  "may",
  "mack",
  "oracle",
  "coulson",
  "fitz",
  "simmons",
] as const;

export type CanonicalRoleId = (typeof CANONICAL_ROLE_IDS)[number];
export const DISPATCHABLE_ROLE_IDS = [
  "hill",
  "daisy",
  "fury",
  "may",
  "mack",
  "oracle",
] as const;
export type DispatchableRoleId = (typeof DISPATCHABLE_ROLE_IDS)[number];
export const HUMAN_GATE_ROLE_IDS = ["coulson", "fitz", "simmons"] as const;
export type HumanGateRoleId = (typeof HUMAN_GATE_ROLE_IDS)[number];
export const V03_ENABLED_ROLE_IDS = ["hill", "daisy", "fury", "may"] as const;
export type V03EnabledRoleId = (typeof V03_ENABLED_ROLE_IDS)[number];

export interface CanonicalRoleDefinitionV1 {
  readonly roleId: CanonicalRoleId;
  readonly seatId: CanonicalRoleId;
  readonly kind: RoleKind;
  readonly v03Enabled: boolean;
}

export interface RoleRoutingProjectionV1 {
  readonly roleId: CanonicalRoleId;
  readonly role: CanonicalRoleDefinitionV1;
  readonly route: RoleRoute;
}

export interface RoleAssignmentResultV1 {
  readonly state: "valid";
  readonly roleId: CanonicalRoleId;
}

type RoleLookupErrorCode = "INVALID_ROLE_ID" | "UNKNOWN_ROLE_ID";
type RoleAssignmentErrorCode =
  | RoleLookupErrorCode
  | "ROLE_NOT_DISPATCHABLE"
  | "ROLE_NOT_ENABLED_IN_V03"
  | "HUMAN_GATE_NOT_ALLOWED"
  | "INVALID_ROLE_ASSIGNMENT_SCOPE";
type RoleResult<T> = { state: "valid"; value: T } | { state: "invalid"; code: RoleLookupErrorCode | RoleAssignmentErrorCode };

const canonicalRoleSet = new Set<string>(CANONICAL_ROLE_IDS);
const dispatchableSet = new Set<string>(DISPATCHABLE_ROLE_IDS);
const humanGateSet = new Set<string>(HUMAN_GATE_ROLE_IDS);
const v03EnabledSet = new Set<string>(V03_ENABLED_ROLE_IDS);
const assignmentScopeSet = new Set<string>(ASSIGNMENT_SCOPES);

const ROLE_DEFINITIONS: readonly CanonicalRoleDefinitionV1[] = Object.freeze(
  CANONICAL_ROLE_IDS.map((roleId): CanonicalRoleDefinitionV1 => ({
    roleId,
    seatId: roleId,
    kind: humanGateSet.has(roleId) ? "human_gate" : "dispatchable_seat",
    v03Enabled: v03EnabledSet.has(roleId),
  })).map((definition) => Object.freeze(definition)),
);
export const CANONICAL_ROLE_REGISTRY_V1: readonly CanonicalRoleDefinitionV1[] = ROLE_DEFINITIONS;
const ROLE_BY_ID: Record<CanonicalRoleId, CanonicalRoleDefinitionV1> = Object.fromEntries(
  ROLE_DEFINITIONS.map((role) => [role.roleId, role]),
) as Record<CanonicalRoleId, CanonicalRoleDefinitionV1>;

const ROLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,63}$/;

function invalidState(code: RoleLookupErrorCode | RoleAssignmentErrorCode): { state: "invalid"; code: typeof code } {
  return { state: "invalid", code };
}

function validState(value: CanonicalRoleDefinitionV1): { state: "valid"; value: CanonicalRoleDefinitionV1 } {
  return { state: "valid", value };
}

export function lookupRole(roleId: unknown): RoleResult<CanonicalRoleDefinitionV1> {
  if (typeof roleId !== "string" || !ROLE_ID.test(roleId)) return invalidState("INVALID_ROLE_ID");
  if (!canonicalRoleSet.has(roleId)) return invalidState("UNKNOWN_ROLE_ID");
  return validState(ROLE_BY_ID[roleId as CanonicalRoleId]);
}

export function isCanonicalRoleId(roleId: unknown): roleId is CanonicalRoleId {
  return lookupRole(roleId).state === "valid";
}

export function isHumanGateRoleId(roleId: unknown): roleId is HumanGateRoleId {
  const lookup = lookupRole(roleId);
  return lookup.state === "valid" && lookup.value.kind === "human_gate";
}

export function isDispatchableRoleId(roleId: unknown): roleId is DispatchableRoleId {
  const lookup = lookupRole(roleId);
  return lookup.state === "valid" && lookup.value.kind === "dispatchable_seat";
}

export function isDispatchableOrHumanRoleId(roleId: unknown): roleId is CanonicalRoleId {
  return lookupRole(roleId).state === "valid";
}

export function isV03EnabledRoleId(roleId: unknown): roleId is V03EnabledRoleId {
  const lookup = lookupRole(roleId);
  return lookup.state === "valid" && lookup.value.v03Enabled;
}

export function routingProjection(roleId: unknown): RoleResult<RoleRoutingProjectionV1> {
  const lookup = lookupRole(roleId);
  if (lookup.state === "invalid") return lookup;
  const role = lookup.value;
  return {
    state: "valid",
    value: {
      roleId: role.roleId,
      role,
      route: role.kind === "human_gate" ? "wait_for_human_gate" : "dispatch_seat",
    },
  };
}

export function validateRoleAssignment(
  roleId: unknown,
  assignment: unknown,
  options: { requireV03Enabled?: boolean } = {},
): RoleResult<RoleAssignmentResultV1["roleId"]> {
  const lookup = lookupRole(roleId);
  if (lookup.state === "invalid") return lookup;
  if (typeof assignment !== "string" || !assignmentScopeSet.has(assignment)) return invalidState("INVALID_ROLE_ASSIGNMENT_SCOPE");
  const role = lookup.value;
  if (assignment === "dispatch") {
    if (role.kind !== "dispatchable_seat") {
      return invalidState("ROLE_NOT_DISPATCHABLE");
    }
    if (options.requireV03Enabled && !role.v03Enabled) {
      return invalidState("ROLE_NOT_ENABLED_IN_V03");
    }
    return { state: "valid", value: role.roleId };
  }
  if (role.kind === "human_gate") return invalidState("HUMAN_GATE_NOT_ALLOWED");
  return { state: "valid", value: role.roleId };
}
