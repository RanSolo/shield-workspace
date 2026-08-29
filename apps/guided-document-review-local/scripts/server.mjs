import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowedAssets = new Set(["/", "/index.html", "/app.js", "/app.js.map", "/styles.css"]);

export function resolvePublicPath(publicRoot, requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname); } catch { return null; }
  if (!allowedAssets.has(pathname)) return null;
  const requested = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
  const root = resolve(publicRoot);
  return requested === root || requested.startsWith(`${root}/`) ? requested : null;
}

const publicRoot = resolve(new URL("../dist/", import.meta.url).pathname);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
export const server = createServer(async (request, response) => {
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
