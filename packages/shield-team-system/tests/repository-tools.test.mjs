import assert from "node:assert/strict";
import { access, chmod, mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
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
  await mkdir(join(root, ".GIT"));
  await mkdir(join(root, ".GNUPG"));
  for (const file of [".ENV.local", "secret.P12", "secret.pFx", "authentication.json"]) await writeFile(join(root, file), "needle-secret\n", "utf8");
  await writeFile(join(root, ".GIT", "config"), "needle-secret\n", "utf8");
  await writeFile(join(root, ".GNUPG", "keyring"), "needle-secret\n", "utf8");
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const searched = await tools.searchRepo({ pattern: "needle" });
  assert.equal(searched.state, "completed");
  assert.match(searched.data, /visible\.txt/u);
  assert.doesNotMatch(searched.data, /\.env|\.git|\.gnupg|secret|authentication/iu);
  assert.equal((await tools.searchRepo({ pattern: "--files" })).state, "completed");
});

test("repository root replacement invalidates an existing tool set", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-broker-replace-"));
  const displaced = `${root}-old`;
  context.after(async () => { await rm(root, { recursive: true, force: true }); await rm(displaced, { recursive: true, force: true }); });
  await writeFile(join(root, "visible.txt"), "original\n", "utf8");
  const tools = await createRepositoryTools(root);
  await rename(root, displaced);
  await mkdir(root);
  await writeFile(join(root, "visible.txt"), "replacement\n", "utf8");
  assert.equal((await tools.readFile({ path: "visible.txt" })).code, "root_identity_changed");
});

test("search executable must prove ripgrep identity and times out fail closed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "shield-broker-rg-root-"));
  const fake = join(await mkdtemp(join(tmpdir(), "shield-broker-rg-bin-")), "rg");
  context.after(async () => { await rm(root, { recursive: true, force: true }); await rm(fake.slice(0, fake.lastIndexOf("/")), { recursive: true, force: true }); });
  await assert.rejects(() => createRepositoryTools(root, { rgExecutable: "/bin/echo" }), /rg_executable_invalid/u);
  await writeFile(fake, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'ripgrep 1.0.0'; exit 0; fi\nwhile true; do :; done\n", "utf8");
  await chmod(fake, 0o755);
  const tools = await createRepositoryTools(root, { rgExecutable: fake, searchTimeoutMs: 10 });
  assert.equal((await tools.searchRepo({ pattern: "needle" })).code, "search_timeout");
});
