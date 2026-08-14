import {
  replaySupervisedMissionJournal,
  resolveReviewPublicationAuthorizationRecordV1,
} from "../dist/mission-v2.mjs";
import { replayProfileAwareMissionJournal } from "../dist/profile-aware-mission-v1.mjs";

function blocked(reason) {
  return { state: "blocked", reason };
}

/**
 * Loads and fully replays the durable journal before selecting one exact queued
 * v8 or v9 publication request. A standalone request or caller-created projection is
 * never sufficient.
 */
export function resolveJournaledPublicationRequest(requestId, options = {}) {
  if (typeof requestId !== "string" || requestId.length === 0) {
    return blocked("publication_request_id_required");
  }
  if (typeof options.loadJournal !== "function") {
    return blocked("journal_loader_required");
  }
  let entries;
  try {
    entries = options.loadJournal();
  } catch {
    return blocked("journal_load_failed");
  }
  if (!Array.isArray(entries)) return blocked("journal_load_failed");
  const firstSchema = entries[0]?.schemaVersion;
  const replay = firstSchema === 9
    ? replayProfileAwareMissionJournal(entries)
    : replaySupervisedMissionJournal(entries);
  if (replay.state !== "valid") return blocked("journal_replay_failed");
  const projection = replay.value;
  if (firstSchema !== 9 && projection.journalSchemaVersion !== 8) {
    return blocked("publication_journal_v8_required");
  }
  const requests = projection.communication.requests.filter(
    (request) => request.requestId === requestId,
  );
  if (requests.length !== 1 || requests[0].adapterContractVersion !== 2) {
    return blocked("publication_request_missing");
  }
  const request = requests[0];
  if (request.state !== "queued") return blocked("publication_request_not_queued");
  const authorization = resolveReviewPublicationAuthorizationRecordV1(
    projection.publicationAuthorizations ?? [],
    request.publicationAuthorizationId,
  );
  if (authorization === null) {
    return blocked("publication_authorization_missing");
  }
  return {
    state: "allowed",
    request,
    authority: authorization.authority,
    usedCandidateIds: projection.communication.requests
      .map(({ candidateId }) => candidateId)
      .filter((candidateId) => candidateId !== null),
    evaluatedThroughSequence: projection.lastSequence,
  };
}
