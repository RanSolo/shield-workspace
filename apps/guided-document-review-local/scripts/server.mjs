import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readGitHubPullRequestHead } from "@shield/github-pr-review-adapter";
import {
  createPullRequestReviewCheckpoints,
  renderPullRequestReviewMarkdown,
  sha256Text,
  verifyPullRequestReviewPacket,
} from "@shield/guided-pr-review";

const allowedAssets = new Set(["/", "/index.html", "/app.js", "/app.js.map", "/styles.css"]);

export function resolvePublicPath(publicRoot, requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname); } catch { return null; }
  if (/^\/trails\/[a-z0-9-]+$/u.test(pathname)) pathname = "/index.html";
  if (!allowedAssets.has(pathname)) return null;
  const requested = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
  const root = resolve(publicRoot);
  return requested === root || requested.startsWith(`${root}/`) ? requested : null;
}

export async function loadPreparedTrail(trailsRoot, slug, options = {}) {
  if (!/^[a-z0-9-]+$/u.test(slug)) throw new TypeError("Invalid prepared trail slug.");
  const manifestPath = resolve(trailsRoot, `${slug}.trail.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const fields = ["schemaVersion", "slug", "title", "reviewerName", "documentPath", "checkpointPath", "packetPath", "reviewBinding", "documentDigest", "checkpointDigest"];
  const legacyFields = ["schemaVersion", "slug", "title", "reviewerName", "documentPath", "checkpointPath"];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || manifest.slug !== slug ||
      ![manifest.title, manifest.reviewerName, manifest.documentPath, manifest.checkpointPath].every((value) => typeof value === "string" && value.length > 0)) {
    throw new TypeError("Malformed prepared trail manifest.");
  }
  if (manifest.schemaVersion === 1 && Object.keys(manifest).sort().join("|") !== legacyFields.sort().join("|")) {
    throw new TypeError("Malformed prepared trail manifest.");
  }
  if (manifest.schemaVersion === 2 && Object.keys(manifest).sort().join("|") !== fields.sort().join("|")) {
    throw new TypeError("Malformed prepared trail manifest.");
  }
  const fromManifest = (path) => isAbsolute(path) ? path : resolve(trailsRoot, path);
  const [documentText, checkpointText] = await Promise.all([
    readFile(fromManifest(manifest.documentPath), "utf8"),
    readFile(fromManifest(manifest.checkpointPath), "utf8"),
  ]);
  if (manifest.schemaVersion === 2) {
    const binding = manifest.reviewBinding;
    if (!isReviewBinding(binding)) throw new TypeError("Malformed prepared review binding.");
    const packet = JSON.parse(await readFile(fromManifest(manifest.packetPath), "utf8"));
    await verifyPullRequestReviewPacket(packet);
    if (packet.packetId !== binding.packetId || packet.packetDigest !== binding.packetDigest ||
        packet.pullRequest.repository !== binding.repository || packet.pullRequest.number !== binding.pullRequestNumber ||
        packet.pullRequest.headRevision !== binding.headRevision) {
      throw new TypeError("Prepared projection is not bound to its packet and exact PR head.");
    }
    const expectedCheckpoints = `${JSON.stringify(createPullRequestReviewCheckpoints(packet), null, 2)}\n`;
    if (await sha256Text(documentText) !== manifest.documentDigest || await sha256Text(checkpointText) !== manifest.checkpointDigest ||
        documentText !== renderPullRequestReviewMarkdown(packet) || checkpointText !== expectedCheckpoints) {
      throw new TypeError("Prepared review projection does not match its packet.");
    }
    const readLiveHead = options.readLiveHead ?? ((repository, number) => readGitHubPullRequestHead(repository, number));
    const liveHead = await readLiveHead(binding.repository, binding.pullRequestNumber);
    if (liveHead !== binding.headRevision) {
      const error = new Error(`Prepared review is stale: reviewed ${binding.headRevision}, live ${liveHead}.`);
      error.code = "STALE_PREPARED_REVIEW";
      throw error;
    }
    return {
      schemaVersion: 2,
      slug,
      title: manifest.title,
      reviewerName: manifest.reviewerName,
      documentText,
      checkpoints: JSON.parse(checkpointText),
      reviewBinding: binding,
    };
  }
  return {
    schemaVersion: 1,
    slug,
    title: manifest.title,
    reviewerName: manifest.reviewerName,
    documentText,
    checkpoints: JSON.parse(checkpointText),
  };
}

function isReviewBinding(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === ["packetId", "packetDigest", "repository", "pullRequestNumber", "headRevision"].sort().join("|") &&
    typeof value.packetId === "string" && /^sha256:[0-9a-f]{64}$/u.test(value.packetDigest) &&
    typeof value.repository === "string" && Number.isSafeInteger(value.pullRequestNumber) && value.pullRequestNumber > 0 &&
    /^[0-9a-f]{40}$/u.test(value.headRevision);
}

const publicRoot = resolve(new URL("../dist/", import.meta.url).pathname);
const trailsRoot = resolve(new URL("../review-kits/", import.meta.url).pathname);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
export const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const trailMatch = pathname.match(/^\/api\/trails\/([a-z0-9-]+)$/u);
  if (trailMatch) {
    try {
      const packet = await loadPreparedTrail(trailsRoot, trailMatch[1]);
      response.writeHead(200, { "cache-control": "no-store", "content-type": types[".json"] });
      response.end(JSON.stringify(packet));
    } catch (error) {
      response.writeHead(error?.code === "STALE_PREPARED_REVIEW" ? 409 : 404);
      response.end(error?.message ?? "Prepared trail not found");
    }
    return;
  }
  const path = resolvePublicPath(publicRoot, request.url ?? "/");
  if (!path) { response.writeHead(400); response.end("Bad path"); return; }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    response.end(body);
  }
  catch { response.writeHead(404); response.end("Not found"); }
});

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.DOCUMENT_TRAIL_PORT ?? "4177");
  server.listen(port, "127.0.0.1", () => console.log(`Document Trail: http://127.0.0.1:${port}`));
}
