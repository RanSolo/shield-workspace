import { posix } from "node:path";

export const CONFIG_SCHEMA_VERSION = 1 as const;
export const DOCTOR_REPORT_VERSION = 1 as const;
export const SHIELD_PACKAGE_VERSION = "0.1.0" as const;
export const SUPPORTED_ADAPTER_IDS = ["github"] as const;
export const SUPPORTED_SEAT_IDS = [
  "hill",
  "daisy",
  "fury",
  "may",
  "coulson",
  "fitz",
  "simmons",
] as const;
export const SUPPORTED_MODE_IDS = ["delivery", "debugger"] as const;
export const HUMAN_AUTHORITY_SEAT_IDS = ["coulson", "fitz", "simmons"] as const;

export type AdapterId = (typeof SUPPORTED_ADAPTER_IDS)[number];
export type SeatId = (typeof SUPPORTED_SEAT_IDS)[number];
export type ModeId = (typeof SUPPORTED_MODE_IDS)[number];
export type HumanAuthoritySeatId = (typeof HUMAN_AUTHORITY_SEAT_IDS)[number];
export type ShieldPathKind = "journals" | "artifacts" | "reports" | "temp";

export interface TrustedHumanBindingRef {
  seatId: HumanAuthoritySeatId;
  bindingRef: string;
}

export type ShieldPaths = Readonly<Record<ShieldPathKind, string>>;

export interface ShieldConfig {
  schemaVersion: 1;
  repositoryId: string;
  adapterId: AdapterId;
  supportedSeatIds: SeatId[];
  supportedModeIds: ModeId[];
  trustedHumanBindingRefs: TrustedHumanBindingRef[];
  paths: ShieldPaths;
}

export interface ConfigIssue {
  code: string;
  path: string;
  message: string;
}

export type ConfigValidationResult =
  | { state: "valid"; value: ShieldConfig }
  | { state: "invalid"; issues: ConfigIssue[] };

export interface CreateShieldConfigInput {
  repositoryId: string;
  coulsonBindingRef: string;
  fitzBindingRef: string;
  simmonsBindingRef?: string;
}

export type DoctorCheckId =
  | "repository-root"
  | "package-version"
  | "config-present"
  | "config-schema"
  | "adapter"
  | "seats"
  | "modes"
  | "bindings"
  | "paths";

export interface DoctorCheck {
  id: DoctorCheckId;
  ok: boolean;
  message: string;
}

export interface DoctorInput {
  repositoryRootReady: boolean;
  packageVersion: string | null;
  configPresent: boolean;
  config?: unknown;
}

export interface DoctorReport {
  reportVersion: 1;
  ok: boolean;
  checks: DoctorCheck[];
}

const CONFIG_FIELDS = [
  "schemaVersion",
  "repositoryId",
  "adapterId",
  "supportedSeatIds",
  "supportedModeIds",
  "trustedHumanBindingRefs",
  "paths",
] as const;
const PATH_FIELDS = ["journals", "artifacts", "reports", "temp"] as const;
const BINDING_FIELDS = ["seatId", "bindingRef"] as const;
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BINDING_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const CREDENTIAL_MARKER = /(?:password|token|secret|api[_-]?key)\s*[:=]|private[_-]?key/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function issue(code: string, path: string, message: string): ConfigIssue {
  return { code, path, message };
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
  issues: ConfigIssue[],
): void {
  const allowed = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      issues.push(issue("missing_field", `${path}.${field}`, `${path} is missing field: ${field}.`));
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      issues.push(issue("unknown_field", `${path}.${field}`, `${path} has unknown field: ${field}.`));
    }
  }
}

function validateKnownStringArray<T extends string>(
  value: unknown,
  supported: readonly T[],
  path: string,
  issues: ConfigIssue[],
): value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("invalid_array", path, `${path} must be a non-empty array.`));
    return false;
  }
  const seen = new Set<string>();
  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const entryPath = `${path}[${index}]`;
    if (typeof entry !== "string" || !supported.includes(entry as T)) {
      issues.push(issue("unsupported_value", entryPath, `${entryPath} is unsupported.`));
      valid = false;
    } else if (seen.has(entry)) {
      issues.push(issue("duplicate_value", entryPath, `${path} duplicates ${entry}.`));
      valid = false;
    }
    if (typeof entry === "string") seen.add(entry);
  }
  for (const required of supported) {
    if (!seen.has(required)) {
      issues.push(issue("missing_supported_value", path, `${path} is missing required value: ${required}.`));
      valid = false;
    }
  }
  return valid;
}

function safeShieldPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return false;
  if (value.includes("\\") || value.includes("\0") || posix.isAbsolute(value)) return false;
  if (!value.startsWith(".shield/")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return posix.normalize(value) === value;
}

function bindingRefIsSafe(value: unknown): value is string {
  return typeof value === "string" && BINDING_REF.test(value) &&
    !value.includes("://") && !CREDENTIAL_MARKER.test(value);
}

export function validateShieldConfig(input: unknown): ConfigValidationResult {
  const issues: ConfigIssue[] = [];
  if (!isPlainObject(input)) {
    return { state: "invalid", issues: [issue("invalid_object", "config", "Config must be a plain object.")] };
  }
  exactFields(input, CONFIG_FIELDS, "config", issues);
  if (issues.some(({ code }) => code === "missing_field")) return { state: "invalid", issues };

  if (input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    issues.push(issue(
      "unsupported_schema_version",
      "config.schemaVersion",
      `Config schemaVersion must be ${CONFIG_SCHEMA_VERSION}.`,
    ));
  }
  if (typeof input.repositoryId !== "string" || !REPOSITORY_ID.test(input.repositoryId)) {
    issues.push(issue(
      "invalid_repository_id",
      "config.repositoryId",
      "repositoryId must use the form owner/name.",
    ));
  }
  if (!SUPPORTED_ADAPTER_IDS.includes(input.adapterId as AdapterId)) {
    issues.push(issue("unsupported_adapter", "config.adapterId", "adapterId must be github for V0.3."));
  }
  validateKnownStringArray(input.supportedSeatIds, SUPPORTED_SEAT_IDS, "config.supportedSeatIds", issues);
  validateKnownStringArray(input.supportedModeIds, SUPPORTED_MODE_IDS, "config.supportedModeIds", issues);

  const bindingSeats = new Set<string>();
  if (!Array.isArray(input.trustedHumanBindingRefs)) {
    issues.push(issue(
      "invalid_bindings",
      "config.trustedHumanBindingRefs",
      "trustedHumanBindingRefs must be an array.",
    ));
  } else {
    for (let index = 0; index < input.trustedHumanBindingRefs.length; index += 1) {
      const binding = input.trustedHumanBindingRefs[index];
      const path = `config.trustedHumanBindingRefs[${index}]`;
      if (!isPlainObject(binding)) {
        issues.push(issue("invalid_binding", path, `${path} must be a plain object.`));
        continue;
      }
      exactFields(binding, BINDING_FIELDS, path, issues);
      if (!HUMAN_AUTHORITY_SEAT_IDS.includes(binding.seatId as HumanAuthoritySeatId)) {
        issues.push(issue("unsupported_binding_seat", `${path}.seatId`, `${path}.seatId is unsupported.`));
      } else if (bindingSeats.has(binding.seatId as string)) {
        issues.push(issue("duplicate_binding_seat", `${path}.seatId`, `${path}.seatId is duplicated.`));
      } else {
        bindingSeats.add(binding.seatId as string);
      }
      if (!bindingRefIsSafe(binding.bindingRef)) {
        issues.push(issue(
          "unsafe_binding_ref",
          `${path}.bindingRef`,
          `${path}.bindingRef must be an opaque credential-free identifier.`,
        ));
      }
    }
  }
  for (const requiredSeat of ["coulson", "fitz"]) {
    if (!bindingSeats.has(requiredSeat)) {
      issues.push(issue(
        "missing_required_binding",
        "config.trustedHumanBindingRefs",
        `A structural binding reference is required for ${requiredSeat}.`,
      ));
    }
  }

  const pathValues: string[] = [];
  if (!isPlainObject(input.paths)) {
    issues.push(issue("invalid_paths", "config.paths", "paths must be a plain object."));
  } else {
    exactFields(input.paths, PATH_FIELDS, "config.paths", issues);
    for (const field of PATH_FIELDS) {
      const value = input.paths[field];
      if (!safeShieldPath(value)) {
        issues.push(issue(
          "unsafe_path",
          `config.paths.${field}`,
          `${field} must be a normalized repository-relative path below .shield/.`,
        ));
      } else {
        pathValues.push(value);
      }
    }
  }
  for (let left = 0; left < pathValues.length; left += 1) {
    for (let right = left + 1; right < pathValues.length; right += 1) {
      const a = pathValues[left];
      const b = pathValues[right];
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        issues.push(issue("overlapping_paths", "config.paths", `Configured paths overlap: ${a} and ${b}.`));
      }
    }
  }

  return issues.length > 0
    ? { state: "invalid", issues }
    : { state: "valid", value: input as unknown as ShieldConfig };
}

export function createShieldConfig(input: CreateShieldConfigInput): ShieldConfig {
  const bindings: TrustedHumanBindingRef[] = [
    { seatId: "coulson", bindingRef: input.coulsonBindingRef },
    { seatId: "fitz", bindingRef: input.fitzBindingRef },
  ];
  if (input.simmonsBindingRef !== undefined) {
    bindings.push({ seatId: "simmons", bindingRef: input.simmonsBindingRef });
  }
  const candidate: ShieldConfig = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    repositoryId: input.repositoryId,
    adapterId: "github",
    supportedSeatIds: [...SUPPORTED_SEAT_IDS],
    supportedModeIds: [...SUPPORTED_MODE_IDS],
    trustedHumanBindingRefs: bindings,
    paths: {
      journals: ".shield/journals",
      artifacts: ".shield/artifacts",
      reports: ".shield/reports",
      temp: ".shield/tmp",
    },
  };
  const checked = validateShieldConfig(candidate);
  if (checked.state === "invalid") {
    throw new Error(checked.issues.map(({ message }) => message).join(" "));
  }
  return checked.value;
}

export function parseShieldConfig(text: unknown): ConfigValidationResult {
  if (typeof text !== "string") {
    return { state: "invalid", issues: [issue("invalid_json", "config", "Config content must be text.")] };
  }
  try {
    return validateShieldConfig(JSON.parse(text));
  } catch {
    return { state: "invalid", issues: [issue("invalid_json", "config", "Config contains malformed JSON.")] };
  }
}

export function formatShieldConfig(config: unknown): string {
  const checked = validateShieldConfig(config);
  if (checked.state === "invalid") {
    throw new Error(checked.issues.map(({ message }) => message).join(" "));
  }
  return `${JSON.stringify(checked.value, null, 2)}\n`;
}

export function evaluateDoctor(input: DoctorInput): DoctorReport {
  const validation = input.configPresent ? validateShieldConfig(input.config) : null;
  const issues = validation?.state === "invalid" ? validation.issues : [];
  const classifiedPrefixes = [
    "config.schemaVersion",
    "config.repositoryId",
    "config.adapterId",
    "config.supportedSeatIds",
    "config.supportedModeIds",
    "config.trustedHumanBindingRefs",
    "config.paths",
  ] as const;
  const check = (id: DoctorCheckId, ok: boolean, message: string): DoctorCheck => ({ id, ok, message });
  const category = (id: DoctorCheckId, prefixes: readonly string[], success: string): DoctorCheck => {
    const matching = issues.filter(({ path }) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)));
    return check(id, matching.length === 0, matching.length === 0 ? success : matching[0].message);
  };

  const checks: DoctorCheck[] = [
    check(
      "repository-root",
      input.repositoryRootReady,
      input.repositoryRootReady ? "Repository root is accessible." : "Repository root is missing, inaccessible, or a symlink.",
    ),
    check(
      "package-version",
      input.packageVersion === SHIELD_PACKAGE_VERSION,
      input.packageVersion === SHIELD_PACKAGE_VERSION
        ? `Package version ${SHIELD_PACKAGE_VERSION} is supported.`
        : `Expected package version ${SHIELD_PACKAGE_VERSION}; received ${input.packageVersion ?? "unknown"}.`,
    ),
    check(
      "config-present",
      input.configPresent,
      input.configPresent ? "Configuration is present." : "Missing .shield/config.json; run shield init.",
    ),
    category(
      "config-schema",
      ["config.schemaVersion", "config.repositoryId"],
      "Configuration schema and repository identity are valid.",
    ),
    category("adapter", ["config.adapterId"], "Configured adapter is supported."),
    category("seats", ["config.supportedSeatIds"], "Configured seats are supported and unique."),
    category("modes", ["config.supportedModeIds"], "Configured modes are supported and unique."),
    category(
      "bindings",
      ["config.trustedHumanBindingRefs"],
      "Required structural human binding references are present and credential-free.",
    ),
    category("paths", ["config.paths"], "Configured SHIELD paths are safe and distinct."),
  ];
  const unclassified = issues.find(({ path }) => !classifiedPrefixes.some((prefix) =>
    path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
  ));
  if (unclassified !== undefined) {
    const schema = checks.find(({ id }) => id === "config-schema");
    if (schema !== undefined) {
      schema.ok = false;
      schema.message = unclassified.message;
    }
  }
  if (!input.configPresent) {
    for (const entry of checks.slice(3)) {
      entry.ok = false;
      entry.message = "Configuration is unavailable for this check.";
    }
  }
  return { reportVersion: DOCTOR_REPORT_VERSION, ok: checks.every(({ ok }) => ok), checks };
}
