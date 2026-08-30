export interface PreparedReviewBinding {
  readonly packetId: string;
  readonly packetDigest: string;
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly headRevision: string;
}

interface PreparedTrailBase {
  readonly slug: string;
  readonly title: string;
  readonly reviewerName: string;
  readonly documentText: string;
  readonly checkpoints: unknown;
}

export type PreparedTrailPacket =
  | Readonly<PreparedTrailBase & { schemaVersion: 1 }>
  | Readonly<PreparedTrailBase & { schemaVersion: 2; reviewBinding: PreparedReviewBinding }>;

export function decodePreparedTrailResponse(value: unknown, expectedSlug: string): PreparedTrailPacket;
export function isPreparedReviewBinding(value: unknown): value is PreparedReviewBinding;
export function reviewerIdentityFromOperatorEntry(value: unknown):
  | Readonly<{ kind: "self_asserted"; name: string }>
  | Readonly<{ kind: "unattributed"; name: null }>;
