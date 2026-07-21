import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FROZEN_COMPILER_GRAPH = Object.freeze([
  "src/canonical.ts", "src/compiler.ts", "src/contracts.ts", "src/errors.ts",
  "src/normalize.ts", "src/registry.ts", "src/renderer.ts", "src/validator.ts",
]);

const prohibited = Object.freeze([
  "node:fs", "node:http", "node:https", "node:net", "node:dns", "node:os",
  "node:child_process", "node:worker_threads", "process.", "Date.now", "new Date",
  "Math.random", "randomUUID", "Intl.", "import(", "fetch(", "WebSocket",
  "openai", "anthropic", "lm studio", "markdown",
]);
const STATIC_IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu;

function resolveLocalImport(importer, specifier) {
  const resolved = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (!resolved.startsWith("src/") || resolved.includes("../")) {
    throw new Error(`PROHIBITED_LOCAL_DEPENDENCY:${importer}->${specifier}`);
  }
  return resolved.endsWith(".js") ? `${resolved.slice(0, -3)}.ts` : resolved;
}

export async function inspectCompilerGraph({
  entry = "src/compiler.ts",
  allowedFiles = FROZEN_COMPILER_GRAPH,
  loadSource = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8"),
} = {}) {
  const allowed = new Set(allowedFiles);
  if (allowed.size !== allowedFiles.length || !allowed.has(entry)) {
    throw new Error("INVALID_FROZEN_COMPILER_GRAPH");
  }
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    if (!allowed.has(path)) throw new Error(`PROHIBITED_LOCAL_DEPENDENCY:${path}`);
    let source;
    try { source = await loadSource(path); }
    catch { throw new Error(`MISSING_COMPILER_GRAPH_ENTRY:${path}`); }
    if (typeof source !== "string") throw new Error(`MISSING_COMPILER_GRAPH_ENTRY:${path}`);
    visited.add(path);
    for (const token of prohibited) {
      assert.equal(source.toLowerCase().includes(token.toLowerCase()), false, `PROHIBITED_DEPENDENCY:${path}:${token}`);
    }
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) {
        const target = resolveLocalImport(path, specifier);
        if (!allowed.has(target)) throw new Error(`PROHIBITED_LOCAL_DEPENDENCY:${path}->${target}`);
        pending.push(target);
      } else if (specifier !== "node:crypto") {
        throw new Error(`PROHIBITED_EXTERNAL_DEPENDENCY:${path}->${specifier}`);
      }
    }
  }
  const unreachable = [...allowed].filter((path) => !visited.has(path)).sort();
  if (unreachable.length > 0) throw new Error(`UNREACHABLE_COMPILER_GRAPH_ENTRY:${unreachable.join(",")}`);
  return Object.freeze({ staticBoundary: "PASS", files: visited.size });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  process.stdout.write(JSON.stringify(await inspectCompilerGraph()));
}
