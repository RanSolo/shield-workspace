import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRepositoryTools,
  isSensitiveRepositoryPath,
  validateRepositoryRelativePath,
} from "../scripts/model/repository-tools.mjs";

async function findRg() {
  const candidates = (process.env.PATH ?? "").split(":").filter(Boolean).map((directory) => join(directory, "rg"));
  candidates.push("/Applications/ChatGPT.app/Contents/Resources/rg");
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.X_OK); return candidate; }
    catch { /* continue */ }
  }
  return null;
}

test("repository paths are relative, closed, and sensitive-path aware", () => {
  assert.equal(validateRepositoryRelativePath("src/index.mts"), true);
  assert.equal(validateRepositoryRelativePath("."), false);
  assert.equal(validateRepositoryRelativePath(".", { allowDot: true }), true);
  for (const value of ["/etc/passwd", "../secret", "src//file", "src\\file", "src/./file", "src/\0file"]) {
    assert.equal(validateRepositoryRelativePath(value), false, value);
  }
  for (const value of [".git/config", ".env", "config/.env.local", ".ssh/id_ed25519", "keys/private.pem", "tokens.json"]) {
    assert.equal(isSensitiveRepositoryPath(value), true, value);
  }
});

test("repository tools read and list bounded regular files without following symlinks", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-broker-root-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-broker-outside-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "visible.txt"), "alpha\nbeta\n", "utf8");
  await writeFile(join(root, ".env"), "SECRET=hidden\n", "utf8");
  await writeFile(join(outside, "secret.txt"), "hidden\n", "utf8");
  await symlink(join(outside, "secret.txt"), join(root, "src", "escape.txt"));

  const tools = await createRepositoryTools(root);
  const read = await tools.readFile({ path: "src/visible.txt" });
  assert.equal(read.state, "completed");
  assert.equal(read.data, "alpha\nbeta\n");
  assert.equal((await tools.readFile({ path: "src/escape.txt" })).code, "symlink_denied");
  assert.equal((await tools.readFile({ path: ".env" })).code, "path_denied");

  const listed = await tools.listFiles({ directory: "." });
  assert.equal(listed.state, "completed");
  assert.match(listed.data, /src\/visible\.txt/u);
  assert.doesNotMatch(listed.data, /escape|\.env|secret/u);
});

test("searchRepo uses bounded rg and excludes sensitive paths", async (context) => {
  const rg = await findRg();
  if (rg === null) return context.skip("rg is unavailable");
  const root = await mkdtemp(join(tmpdir(), "shield-broker-search-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, "visible.txt"), "needle\n", "utf8");
  await writeFile(join(root, ".env"), "needle-secret\n", "utf8");
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const searched = await tools.searchRepo({ pattern: "needle" });
  assert.equal(searched.state, "completed");
  assert.match(searched.data, /visible\.txt/u);
  assert.doesNotMatch(searched.data, /\.env|secret/u);
  assert.equal((await tools.searchRepo({ pattern: "--files" })).state, "completed");
});
