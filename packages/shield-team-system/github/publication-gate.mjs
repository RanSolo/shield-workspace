import { replaySupervisedMissionJournal } from "../dist/mission-v2.mjs";

function blocked(reason) {
  return { state: "blocked", reason };
}

/**
 * Loads and fully replays the durable journal before selecting one exact queued
 * v8 publication request. A standalone request or caller-created projection is
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
  const replay = replaySupervisedMissionJournal(entries);
  if (replay.state !== "valid") return blocked("journal_replay_failed");
  const projection = replay.value;
  if (projection.journalSchemaVersion !== 8) {
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
  const authorizations = (projection.publicationAuthorizations ?? []).filter(
    ({ authorization }) =>
      authorization.authorizationId === request.publicationAuthorizationId,
  );
  if (authorizations.length !== 1) {
    return blocked("publication_authorization_missing");
  }
  return {
    state: "allowed",
    request,
    authority: authorizations[0].authority,
    usedCandidateIds: projection.communication.requests
      .map(({ candidateId }) => candidateId)
      .filter((candidateId) => candidateId !== null),
    evaluatedThroughSequence: projection.lastSequence,
  };
}
