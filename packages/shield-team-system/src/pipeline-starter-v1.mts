import { createHash } from "node:crypto";
import {
  type PipelineCommandBindingV1,
  type PipelineModeBindingV1,
  type PipelineModeId,
  type PipelineUnavailableModeV1,
  type RepositoryPipelineProfileV1,
} from "./pipeline-profile-v1.mjs";

export const STARTER_PIPELINE_SCHEMA_VERSION = 1 as const;
export const STARTER_PIPELINE_IDS = [
  "minimal",
  "web-app",
  "service-api",
  "database-backed-app",
  "enterprise",
] as const;

export type StarterPipelineId = (typeof STARTER_PIPELINE_IDS)[number];

export interface StarterPipelineSelectionInput {
  repositoryId: string;
  starterPipelineId: StarterPipelineId;
  packageScripts: Readonly<Record<string, string>>;
  discoveredAt: string;
}

export interface StarterPipelineSelectionV1 {
  profile: RepositoryPipelineProfileV1;
  selectedModes: readonly PipelineModeId[];
  supportedModes: readonly PipelineModeId[];
  unavailableModes: readonly PipelineUnavailableModeV1[];
}

const PRESET_MODES: Record<StarterPipelineId, readonly PipelineModeId[]> = {
  minimal: ["lint", "typecheck", "unit-test"],
  "web-app": ["lint", "typecheck", "unit-test", "build", "e2e"],
  "service-api": ["lint", "typecheck", "unit-test", "integration-test", "package-audit"],
  "database-backed-app": ["lint", "typecheck", "unit-test", "build", "e2e", "migration-validation"],
  enterprise: [
    "lint",
    "typecheck",
    "unit-test",
    "integration-test",
    "e2e",
    "build",
    "sonarqube",
    "package-audit",
    "migration-validation",
    "security-scan",
    "full-pipeline",
  ],
};

const SCRIPT_CANDIDATES: Record<PipelineModeId, readonly string[]> = {
  lint: ["lint"],
  typecheck: ["typecheck", "type-check", "tsc"],
  "unit-test": ["unit-test", "test:unit", "test"],
  "integration-test": ["integration-test", "test:integration", "integration"],
  e2e: ["e2e", "test:e2e", "test:integration:e2e"],
  build: ["build"],
  sonarqube: ["sonarqube"],
  "package-audit": ["package-audit", "audit", "npm-audit"],
  "migration-validation": ["migration-validation", "migration:validate", "db:migrate:check"],
  "security-scan": ["security-scan", "security:scan", "scan"],
  "full-pipeline": ["full-pipeline", "pipeline", "ci"],
};

const STALE_PATHS = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"];

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function resolveCommandBinding(
  presetId: StarterPipelineId,
  modeId: PipelineModeId,
  scripts: Readonly<Record<string, string>>,
): PipelineCommandBindingV1 | null {
  const candidate = SCRIPT_CANDIDATES[modeId].find((scriptName) => typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0);
  if (!candidate) return null;
  return {
    commandId: `pipeline:starter:${presetId}:${modeId}`,
    executable: "npm",
    args: ["run", candidate],
  };
}

function unavailableReason(modeId: PipelineModeId): PipelineUnavailableModeV1 {
  return {
    modeId,
    reason: "missing-command",
    evidenceRef: `pipeline:starter:${modeId}:missing-command`,
  };
}

export function createStarterPipelineSelectionV1(
  input: StarterPipelineSelectionInput,
): StarterPipelineSelectionV1 {
  const selectedModes = [...PRESET_MODES[input.starterPipelineId]];
  const supported: PipelineModeBindingV1[] = [];
  const unavailable: PipelineUnavailableModeV1[] = [];

  for (const modeId of selectedModes) {
    const command = resolveCommandBinding(input.starterPipelineId, modeId, input.packageScripts);
    if (command) {
      supported.push({
        modeId,
        evidenceKind: "package-script",
        evidenceRef: `pipeline:starter:${input.starterPipelineId}:${modeId}:package-script`,
        command,
      });
    } else {
      unavailable.push(unavailableReason(modeId));
    }
  }

  const supportedModes = supported.map(({ modeId }) => modeId);
  const profile: RepositoryPipelineProfileV1 = {
    schemaVersion: STARTER_PIPELINE_SCHEMA_VERSION,
    contractVersion: "pipeline.profile.v1",
    profileId: `pipeline:starter:${input.starterPipelineId}`,
    repository: input.repositoryId,
    artifactRevisionId: `sha256:${createHash("sha256").update(stableJson({
      repositoryId: input.repositoryId,
      starterPipelineId: input.starterPipelineId,
      packageScripts: Object.keys(input.packageScripts).sort().reduce<Record<string, string>>((result, key) => {
        result[key] = input.packageScripts[key];
        return result;
      }, {}),
      selectedModes,
      supportedModes,
      unavailableModes: unavailable.map(({ modeId, reason, evidenceRef }) => ({ modeId, reason, evidenceRef })),
    })).digest("hex")}`,
    discoveredAt: input.discoveredAt,
    supported,
    defaultModes: supportedModes,
    conditional: [],
    unavailable,
    staleWhenChanged: [...STALE_PATHS],
  };

  return {
    profile,
    selectedModes,
    supportedModes,
    unavailableModes: unavailable,
  };
}

export function validateStarterPipelineId(value: unknown): value is StarterPipelineId {
  return typeof value === "string" && (STARTER_PIPELINE_IDS as readonly string[]).includes(value);
}
