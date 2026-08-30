import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { observeGitHubPullRequest, parseGitHubPullRequestUrl } from "@shield/github-pr-review-adapter";
import {
  compilePullRequestReview,
  createPullRequestReviewCheckpoints,
  renderPullRequestReviewMarkdown,
  sha256Text,
} from "@shield/guided-pr-review";

const args = parseArgs(process.argv.slice(2));
const pr = parseGitHubPullRequestUrl(args.pr);
const workspaceRoot = resolve(new URL("../../../", import.meta.url).pathname);
const authoringPath = resolve(workspaceRoot, args.authoring);
const outputRoot = resolve(workspaceRoot, args.output ?? "apps/guided-document-review-local/review-kits");
const authoring = JSON.parse(await readFile(authoringPath, "utf8"));

const observedPr = await observeGitHubPullRequest(pr);
if (authoring.expectedHeadRevision !== observedPr.headRevision) {
  console.log(JSON.stringify({
    state: "stale",
    pullRequest: observedPr.url,
    reviewedHeadRevision: authoring.expectedHeadRevision,
    liveHeadRevision: observedPr.headRevision,
    nextAction: "Refresh the authored evidence against the live head before opening the review.",
  }, null, 2));
  process.exit(2);
}
const packet = await compilePullRequestReview(observedPr, authoring.coverage);
const markdown = renderPullRequestReviewMarkdown(packet);
const checkpoints = createPullRequestReviewCheckpoints(packet);
const slug = authoring.slug;
const checkpointText = `${JSON.stringify(checkpoints, null, 2)}\n`;
const manifest = {
  schemaVersion: 2,
  slug,
  title: authoring.title,
  reviewerName: authoring.reviewerName,
  documentPath: `${slug}.md`,
  checkpointPath: `${slug}-checkpoints.json`,
  packetPath: `${slug}.packet.json`,
  reviewBinding: {
    packetId: packet.packetId,
    packetDigest: packet.packetDigest,
    repository: packet.pullRequest.repository,
    pullRequestNumber: packet.pullRequest.number,
    headRevision: packet.pullRequest.headRevision,
  },
  documentDigest: await sha256Text(markdown),
  checkpointDigest: await sha256Text(checkpointText),
};

await Promise.all([
  writeFile(resolve(outputRoot, `${slug}.packet.json`), `${JSON.stringify(packet, null, 2)}\n`),
  writeFile(resolve(outputRoot, `${slug}.md`), markdown),
  writeFile(resolve(outputRoot, `${slug}-checkpoints.json`), checkpointText),
  writeFile(resolve(outputRoot, `${slug}.trail.json`), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify({
  state: "prepared",
  pullRequest: observedPr.url,
  headRevision: observedPr.headRevision,
  packetId: packet.packetId,
  trailPath: `/trails/${slug}`,
}, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value) throw new TypeError("Usage: prepare-pr-review --pr <GitHub PR URL> --authoring <JSON> [--output <directory>]");
    parsed[key.slice(2)] = value;
  }
  if (!parsed.pr || !parsed.authoring) throw new TypeError("Both --pr and --authoring are required.");
  return parsed;
}
