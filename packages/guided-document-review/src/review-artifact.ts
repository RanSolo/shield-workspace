import type { CheckpointSet } from "./checkpoint.js";
import { sha256Json, sha256Text } from "./canonical-json.js";
import { collectReplacementRequests } from "./checkpoint-prompt.js";
import type { ReplacementRequest, ReviewSession } from "./review-session.js";
import { decodeReviewSession } from "./review-session-codec.js";
import { applyConfirmedReplacements } from "./replacements.js";
import type { SourceDocument } from "./source-document.js";

export interface ReviewArtifactV2 {
  readonly schemaVersion: 2;
  readonly authority: "none";
  readonly effect: "educational_review_only";
  readonly artifactId: string;
  readonly source: Pick<SourceDocument, "sourceId" | "title" | "sourceDigest">;
  readonly checkpointSet: Pick<CheckpointSet, "checkpointSetId" | "title" | "checkpointSetDigest">;
  readonly sessionId: string;
  readonly reviewer: ReviewSession["reviewer"];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sourceDigest: string;
  readonly revisedSourceDigest: string;
  readonly replacements: readonly ReplacementRequest[];
  readonly artifactDigest: string;
}

export async function createReviewArtifact(
  source: SourceDocument,
  checkpointSet: CheckpointSet,
  session: ReviewSession,
): Promise<ReviewArtifactV2> {
  const decoded = decodeReviewSession(session, source, checkpointSet);
  if (!decoded.ok) throw new TypeError(`Invalid review session: ${decoded.errors.join(" ")}`);
  if (decoded.session.phase !== "complete") throw new TypeError("Finish every checkpoint before exporting the artifact.");
  const verifiedSession = decoded.session;
  const replacements = collectReplacementRequests(checkpointSet, verifiedSession).map(({ replacement }) => replacement);
  const revisedText = applyConfirmedReplacements(source.text, replacements);
  const revisedSourceDigest = await sha256Text(revisedText);
  const material = {
    schemaVersion: 2 as const,
    authority: "none" as const,
    effect: "educational_review_only" as const,
    source: { sourceId: source.sourceId, title: source.title, sourceDigest: source.sourceDigest },
    checkpointSet: {
      checkpointSetId: checkpointSet.checkpointSetId,
      title: checkpointSet.title,
      checkpointSetDigest: checkpointSet.checkpointSetDigest,
    },
    sessionId: verifiedSession.sessionId,
    reviewer: verifiedSession.reviewer,
    startedAt: verifiedSession.startedAt,
    completedAt: verifiedSession.updatedAt,
    sourceDigest: source.sourceDigest,
    revisedSourceDigest,
    replacements,
  };
  const artifactDigest = await sha256Json(material);
  return { ...material, artifactId: `artifact:${artifactDigest.slice(7, 23)}`, artifactDigest };
}
