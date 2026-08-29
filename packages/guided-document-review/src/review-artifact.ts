import type { CheckpointSet } from "./checkpoint.js";
import { sha256Json } from "./canonical-json.js";
import type { ReviewSession } from "./review-session.js";
import type { SourceDocument } from "./source-document.js";

export interface ReviewArtifactV1 {
  readonly schemaVersion: 1;
  readonly authority: "none";
  readonly effect: "educational_review_only";
  readonly artifactId: string;
  readonly source: Pick<SourceDocument, "sourceId" | "title" | "sourceDigest">;
  readonly checkpointSet: Pick<CheckpointSet, "checkpointSetId" | "title" | "checkpointSetDigest">;
  readonly sessionId: string;
  readonly reviewer: ReviewSession["reviewer"];
  readonly answers: ReviewSession["answers"];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly summary: Readonly<Record<"understand" | "question" | "revise" | "approve", number>>;
  readonly artifactDigest: string;
}

export async function createReviewArtifact(
  source: SourceDocument,
  checkpointSet: CheckpointSet,
  session: ReviewSession,
): Promise<ReviewArtifactV1> {
  if (session.phase !== "complete") throw new TypeError("Finish every checkpoint before exporting the artifact.");
  const summary = { understand: 0, question: 0, revise: 0, approve: 0 };
  Object.values(session.answers).forEach((answer) => {
    if (answer.decision) summary[answer.decision] += 1;
  });
  const material = {
    schemaVersion: 1 as const,
    authority: "none" as const,
    effect: "educational_review_only" as const,
    source: { sourceId: source.sourceId, title: source.title, sourceDigest: source.sourceDigest },
    checkpointSet: {
      checkpointSetId: checkpointSet.checkpointSetId,
      title: checkpointSet.title,
      checkpointSetDigest: checkpointSet.checkpointSetDigest,
    },
    sessionId: session.sessionId,
    reviewer: session.reviewer,
    answers: session.answers,
    startedAt: session.startedAt,
    completedAt: session.updatedAt,
    summary,
  };
  const artifactDigest = await sha256Json(material);
  return { ...material, artifactId: `artifact:${artifactDigest.slice(7, 23)}`, artifactDigest };
}
