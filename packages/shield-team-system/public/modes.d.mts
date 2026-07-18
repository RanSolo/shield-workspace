import type { MissionRecord, ValidationResult } from "./mission.mjs";

export const MODE_MANIFEST_SCHEMA_VERSION: 1;
export const MAX_MODE_CONTEXT_REFS: 32;

export interface ModeManifest {
  schemaVersion: 1;
  modeId: string;
  modeVersion: string;
  description: string;
  compatibility: {
    seats: string[];
    missionSchemaVersions: number[];
  };
  contextRefs: string[];
}

export interface ModeRegistry {
  schemaVersion: 1;
  manifests: ModeManifest[];
}

export interface ResolvedModeContext {
  modeId: string;
  modeVersion: string;
  activationSource: string;
  description: string;
  contextRefs: string[];
}

export interface ResolvedSeatContext {
  seatId: string;
  modes: ResolvedModeContext[];
}

export interface ResolvedSeatModeContexts {
  seats: ResolvedSeatContext[];
}

export function validateModeManifest(manifest: unknown): ValidationResult<ModeManifest>;
export function createModeRegistry(manifests: unknown): ValidationResult<ModeRegistry>;
export function resolveSeatModeContexts(
  missionRecord: MissionRecord,
  registry: ModeRegistry,
): ValidationResult<ResolvedSeatModeContexts>;
