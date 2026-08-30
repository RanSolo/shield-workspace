import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  compilePullRequestReview,
  createPullRequestReviewCheckpoints,
  renderPullRequestReviewMarkdown,
} from "@shield/guided-pr-review";

const execute = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const pr = parsePullRequestUrl(args.pr);
const invocationRoot = process.env.INIT_CWD ?? process.cwd();
const authoringPath = resolve(invocationRoot, args.authoring);
const outputRoot = resolve(args.output ?? new URL("../review-kits/", import.meta.url).pathname);
const authoring = JSON.parse(await readFile(authoringPath, "utf8"));

const observedPr = await ghJson([
  "pr", "view", String(pr.number), "--repo", pr.repository,
  "--json", "number,title,body,url,baseRefOid,headRefOid,files,closingIssuesReferences,updatedAt",
]);
if (authoring.expectedHeadRevision !== observedPr.headRefOid) {
  console.log(JSON.stringify({
    state: "stale",
    pullRequest: observedPr.url,
    reviewedHeadRevision: authoring.expectedHeadRevision,
    liveHeadRevision: observedPr.headRefOid,
    nextAction: "Refresh the authored evidence against the live head before opening the review.",
  }, null, 2));
  process.exit(2);
}
const linkedIssues = await Promise.all(observedPr.closingIssuesReferences.map((reference) =>
  ghJson(["issue", "view", String(reference.number), "--repo", pr.repository, "--json", "number,title,body,url,updatedAt"])
));
if (linkedIssues.length === 0) throw new Error(`PR #${pr.number} has no linked closing issue with acceptance criteria.`);

const snapshot = {
  schemaVersion: 1,
  repository: pr.repository,
  number: observedPr.number,
  title: observedPr.title,
  body: observedPr.body,
  url: observedPr.url,
  baseRevision: observedPr.baseRefOid,
  headRevision: observedPr.headRefOid,
  changedFiles: observedPr.files,
  linkedIssues,
  observedAt: new Date().toISOString(),
};
const packet = await compilePullRequestReview(snapshot, authoring.coverage);
const markdown = renderPullRequestReviewMarkdown(packet);
const checkpoints = createPullRequestReviewCheckpoints(packet);
const slug = authoring.slug;
const manifest = {
  schemaVersion: 1,
  slug,
  title: authoring.title,
  reviewerName: authoring.reviewerName,
  documentPath: `${slug}.md`,
  checkpointPath: `${slug}-checkpoints.json`,
};

await Promise.all([
  writeFile(resolve(outputRoot, `${slug}.packet.json`), `${JSON.stringify(packet, null, 2)}\n`),
  writeFile(resolve(outputRoot, `${slug}.md`), markdown),
  writeFile(resolve(outputRoot, `${slug}-checkpoints.json`), `${JSON.stringify(checkpoints, null, 2)}\n`),
  writeFile(resolve(outputRoot, `${slug}.trail.json`), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify({
  state: "prepared",
  pullRequest: observedPr.url,
  headRevision: observedPr.headRefOid,
  packetId: packet.packetId,
  trailPath: `/trails/${slug}`,
}, null, 2));

async function ghJson(command) {
  const { stdout } = await execute("gh", command, { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

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

function parsePullRequestUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") throw new TypeError("Only https://github.com pull-request URLs are supported.");
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u);
  if (!match) throw new TypeError("Expected a GitHub pull-request URL.");
  return { repository: `${match[1]}/${match[2]}`, number: Number(match[3]) };
}
