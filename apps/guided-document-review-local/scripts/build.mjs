import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const source = join(root, "src");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [join(source, "main.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: join(dist, "app.js"),
  sourcemap: true,
});

for (const file of ["index.html", "styles.css"]) {
  await copyFile(join(source, file), join(dist, file));
}
