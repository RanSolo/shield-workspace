import { pathToFileURL } from "node:url";

import { createChildImplementationHandoffReadyV1 } from "../../dist/feature-integration-evidence-v1.mjs";
import { replayFeatureOperationJournalV1 } from "../../dist/feature-integration-v1.mjs";
import { readFeatureOperationJournalStoreV1 } from "../../dist/feature-integration-store-v1.mjs";
import { createRollbackMissionHandoffReadyV1 } from "../../github/feature-integration-workspace-v1.mjs";

export const FEATURE_INTEGRATION_CONTROLLER_CONTRACT_VERSION = "feature.integration.controller.v1";

function blocked(reason, replay = null) { return { state: "blocked", reason, replay }; }

/**
 * Replays trusted state and selects at most one stage. Effects remain delegated
 * to the bounded stage APIs and occur only when the caller explicitly supplies
 * executeStage with an exact stage request.
 */
export async function runFeatureIntegrationControllerV1(input, dependencies = {}) {
  if (!input || typeof input !== "object" || !input.storeScope || !input.repositoryObservation) return blocked("invalid_input");
  const read = await (dependencies.readJournal ?? readFeatureOperationJournalStoreV1)(input.storeScope);
  if (read.state === "recovery_required") return { state: "recovery_required", reason: read.code };
  if (read.state !== "accepted" || !read.value.journal) return blocked(read.code ?? "journal_unavailable");
  const replayed = (dependencies.replayJournal ?? replayFeatureOperationJournalV1)(read.value.journal);
  if (replayed.state !== "valid") return blocked(`replay_${replayed.reason.toLowerCase()}`);
  const replay = replayed.value, observation = input.repositoryObservation;
  if (observation.repositoryId !== replay.replayContext.repositoryId || observation.featureBranch !== replay.replayContext.activePlan.featureBranch || observation.headRevision !== replay.terminalHeadRevision || observation.treeDigest !== replay.terminalTreeDigest || observation.challengeId !== input.challengeId) return blocked("repository_drift", replay);
  if (Date.parse(observation.observedAt) >= Date.parse(replay.replayContext.activePlan.expiresAt)) return { state: "blocked", reason: "authority_expired", replay };
  if (replay.pendingEffect) return { state: "recovery_required", reason: replay.uncertainEffect ? "effect_uncertain" : "effect_prepared", replay };
  const lifecycle = replay.replayContext.lifecycle.state;
  if (lifecycle === "paused") return { state: "paused", replay };
  if (lifecycle === "cancelled") return { state: "cancelled", replay };
  if (lifecycle === "superseded") return { state: "split", replay };
  if (["expired", "integrated"].includes(lifecycle)) return lifecycle === "integrated" ? { state: "completed", replay } : blocked("authority_expired", replay);

  const nextStage = replay.nextStage;
  if (nextStage === "implementation_handoff") {
    const handoff = createChildImplementationHandoffReadyV1({ replay, candidate: input.stageInput?.candidate });
    return handoff.state === "accepted" ? handoff.value : blocked(handoff.reason, replay);
  }
  if (nextStage === "rollback_mission_handoff") {
    const handoff = createRollbackMissionHandoffReadyV1({ replay });
    return handoff.state === "rollback_mission_handoff_ready" ? { ...handoff, replay } : blocked(handoff.reason, replay);
  }
  if (nextStage === "completed") return { state: "completed", replay };
  if (nextStage === "blocked") return { state: "recovery_required", reason: "pending_effect", replay };

  const owner = dependencies.stageOwners?.[nextStage];
  if (!input.executeStage) return { state: "ready", stage: nextStage, replay };
  if (typeof owner !== "function") return blocked("stage_owner_unavailable", replay);
  const result = await owner({ replay, journal: read.value.journal, stageInput: input.stageInput, storeScope: input.storeScope });
  return { state: result?.state ?? "blocked", stage: nextStage, result, replay };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { process.stdout.write(`${JSON.stringify(blocked("invalid_json"))}\n`); process.exitCode = 2; return; }
  const result = await runFeatureIntegrationControllerV1(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state === "blocked" || result.state === "recovery_required") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
