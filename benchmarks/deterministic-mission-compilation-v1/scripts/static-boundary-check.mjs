import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/experiment.ts"), "utf8");
const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
const prohibited = ["node:fs", "node:http", "node:https", "node:net", "node:child_process", "node:os", "node:process"];
const violations = imports.filter((item) => prohibited.includes(item));
if (violations.length > 0) throw new Error(`prohibited_import:${violations.join(",")}`);
if (imports.length !== 1 || imports[0] !== "node:crypto") throw new Error(`unexpected_dependency_graph:${imports.join(",")}`);

const compilerStart = source.indexOf("export function compileDispatch");
const compilerEnd = source.indexOf("export function createSharedArtifacts");
const compilerSurface = source.slice(compilerStart, compilerEnd);
for (const token of ["Date", "Math.random", "process.", "fetch(", "readFile", "writeFile", "normalize(", "toLocale"] ) {
  if (compilerSurface.includes(token)) throw new Error(`prohibited_compiler_surface:${token}`);
}
process.stdout.write(JSON.stringify({ state: "PASS", sourceFiles: 1, allowedImports: imports }) + "\n");
