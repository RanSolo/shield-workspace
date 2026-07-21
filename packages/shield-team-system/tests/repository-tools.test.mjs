import assert from "node:assert/strict";
import {
  access,
  appendFile,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  createRepositoryTools,
  isSensitiveRepositoryPath,
  validateRepositoryRelativePath,
} from "../scripts/model/repository-tools.mjs";

const DENIED_PATH_CASES = Object.freeze([
  [".git/config", "shield-denied-00"],
  [".GIT/config", "shield-denied-01"],
  [".env", "shield-denied-02"],
  ["config/.env.local", "shield-denied-03"],
  [".ENV.production", "shield-denied-04"],
  [".ssh/id_ed25519", "shield-denied-05"],
  [".SSH/known_hosts", "shield-denied-06"],
  [".aws/credentials", "shield-denied-07"],
  [".AWS/config", "shield-denied-08"],
  [".gnupg/keyring", "shield-denied-09"],
  [".GNUPG/private-keys-v1.d/key", "shield-denied-10"],
  ["credentials/value.txt", "shield-denied-11"],
  ["config/CREDENTIALS.json", "shield-denied-12"],
  ["tokens.json", "shield-denied-13"],
  ["nested/Token.cache", "shield-denied-14"],
  ["authentication.json", "shield-denied-15"],
  ["nested/AUTH.txt", "shield-denied-16"],
  ["id_rsa", "shield-denied-17"],
  ["keys/id_ed25519.pub", "shield-denied-18"],
  ["keys/ID_ECDSA.backup", "shield-denied-19"],
  ["keys/private.pem", "shield-denied-20"],
  ["keys/private.KEY", "shield-denied-21"],
  ["keys/secret.p12", "shield-denied-22"],
  ["keys/secret.PFX", "shield-denied-23"],
]);
const MUTATION_PATH_CASE = Object.freeze([
  "nested/.AWS/credentials.backup",
  "shield-denied-mutation",
]);
const EXACT_SEGMENT_PATH_CASES = Object.freeze([
  [".git", "shield-denied-segment-00"],
  [".SSH", "shield-denied-segment-01"],
  [".aws", "shield-denied-segment-02"],
  [".GNUPG", "shield-denied-segment-03"],
  ["CREDENTIALS", "shield-denied-segment-04"],
]);
const UNICODE_CASE_EQUIVALENT_PATH_CASES = Object.freeze([
  ["private.Key", "shield-denied-unicode-00"],
  ["id_rſa", "shield-denied-unicode-01"],
  ["toKen.json", "shield-denied-unicode-02"],
]);
const SAFE_PATH_CASES = Object.freeze([
  ["src/visible.txt", "shield-visible-00"],
  ["docs/authors.md", "shield-visible-01"],
  ["docs/tokenization.md", "shield-visible-02"],
  ["keys/public.txt", "shield-visible-03"],
]);

const repositoryToolsModuleUrl = new URL(
  "../scripts/model/repository-tools.mjs",
  import.meta.url,
);
const repositoryPolicyModuleUrl = new URL(
  "../scripts/model/repository-sensitive-policy.mjs",
  import.meta.url,
);

async function writeCases(root, cases) {
  for (const [path, marker] of cases) {
    const target = join(root, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await appendFile(target, `${marker}\n`, "utf8");
  }
}

async function observeParity(tools, deniedCases) {
  const allCases = [...deniedCases, ...SAFE_PATH_CASES];
  const reads = [];
  for (const [path, marker] of allCases) {
    reads.push({ path, marker, result: await tools.readFile({ path }) });
  }
  return {
    reads,
    list: await tools.listFiles({ directory: "." }),
    search: await tools.searchRepo({ pattern: "shield-" }),
  };
}

function assertCompletedObservation(observation) {
  assert.equal(observation.list.state, "completed", "list observation must complete");
  assert.equal(observation.search.state, "completed", "search observation must complete");
  for (const [path, marker] of SAFE_PATH_CASES) {
    const read = observation.reads.find((entry) => entry.path === path);
    assert.equal(read?.result.state, "completed", `${path} safe read must complete`);
    assert.match(read.result.data, new RegExp(marker, "u"), `${path} safe marker must be read`);
  }
}

function parityMismatches(observation, deniedCases) {
  assertCompletedObservation(observation);
  const listed = new Set(
    observation.list.data.split("\n").filter(Boolean).map((path) => path.toLowerCase()),
  );
  const mismatches = [];
  for (const [path, marker] of deniedCases) {
    const read = observation.reads.find((entry) => entry.path === path);
    if (read?.result.code !== "path_denied") {
      const actual = read?.result.state === "completed" && read.result.data.includes(marker)
        ? "visible"
        : `unexpected:${read?.result.code ?? "missing"}`;
      mismatches.push({ tool: "readFile", path, marker, expected: "denied", actual });
    }
    if (listed.has(path.toLowerCase())) {
      mismatches.push({ tool: "listFiles", path, marker, expected: "denied", actual: "visible" });
    }
    if (observation.search.data.includes(marker)) {
      mismatches.push({ tool: "searchRepo", path, marker, expected: "denied", actual: "visible" });
    }
  }
  for (const [path, marker] of SAFE_PATH_CASES) {
    const read = observation.reads.find((entry) => entry.path === path);
    if (read?.result.state !== "completed" || !read.result.data.includes(marker)) {
      mismatches.push({ tool: "readFile", path, marker, expected: "visible", actual: "denied" });
    }
    if (!listed.has(path.toLowerCase())) {
      mismatches.push({ tool: "listFiles", path, marker, expected: "visible", actual: "denied" });
    }
    if (!observation.search.data.includes(marker)) {
      mismatches.push({ tool: "searchRepo", path, marker, expected: "visible", actual: "denied" });
    }
  }
  return mismatches;
}

function normalizedSearchObservation(result) {
  return {
    ...result,
    data: result.data.split("\n").filter(Boolean).sort().join("\n"),
  };
}

function replaceExactlyOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length - 1, 1, `expected one mutation site: ${needle}`);
  return source.replace(needle, replacement);
}

async function importToolMutant(context, mutation) {
  const directory = await mkdtemp(join(tmpdir(), `shield-repository-${mutation.tool}-mutant-`));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const [toolSource, policySource] = await Promise.all([
    readFile(repositoryToolsModuleUrl, "utf8"),
    readFile(repositoryPolicyModuleUrl, "utf8"),
  ]);
  const mutatedSource = replaceExactlyOnce(toolSource, mutation.needle, mutation.replacement);
  const toolPath = join(directory, "repository-tools.mjs");
  await Promise.all([
    writeFile(toolPath, mutatedSource, "utf8"),
    writeFile(join(directory, "repository-sensitive-policy.mjs"), policySource, "utf8"),
  ]);
  return import(`${pathToFileURL(toolPath).href}?mutant=${mutation.tool}`);
}

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

test("sensitive policy compiler rejects literals outside its closed grammars", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-policy-grammar-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const source = await readFile(repositoryPolicyModuleUrl, "utf8");
  const target = join(directory, "repository-sensitive-policy.mjs");
  const invalidSegments = [
    "/git", "git/name", "git\\name", "git name", "!git", "g*", "g?", "g[", "g]",
    "g{", "g}", ".git.more", "g\u0001",
  ];
  for (let index = 0; index < invalidSegments.length; index += 1) {
    const mutated = replaceExactlyOnce(source, '".git"', JSON.stringify(invalidSegments[index]));
    await writeFile(target, mutated, "utf8");
    await assert.rejects(
      import(`${pathToFileURL(target).href}?segment=${index}`),
      /sensitive_repository_policy_invalid/u,
    );
  }
  for (const [index, extension] of [".pem", "private_key", "toolong99", "KEY"].entries()) {
    const mutated = replaceExactlyOnce(source, '"pem"', JSON.stringify(extension));
    await writeFile(target, mutated, "utf8");
    await assert.rejects(
      import(`${pathToFileURL(target).href}?extension=${index}`),
      /sensitive_repository_policy_invalid/u,
    );
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
  for (const file of [".ENV.local", "secret.P12", "secret.pFx", "authentication.json", "id_rsa", "id_ed25519.pub"]) await writeFile(join(root, file), "needle-secret\n", "utf8");
  await writeFile(join(root, ".GIT", "config"), "needle-secret\n", "utf8");
  await writeFile(join(root, ".GNUPG", "keyring"), "needle-secret\n", "utf8");
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const searched = await tools.searchRepo({ pattern: "needle" });
  assert.equal(searched.state, "completed");
  assert.match(searched.data, /visible\.txt/u);
  assert.doesNotMatch(searched.data, /\.env|\.git|\.gnupg|secret|authentication|id_rsa|id_ed25519/iu);
  assert.equal((await tools.searchRepo({ pattern: "--files" })).state, "completed");
});

test("canonical denied paths have read, list, and search parity without safe-name overreach", async (context) => {
  const rg = await findRg();
  assert.ok(rg, "trusted rg is required for sensitive-path parity acceptance");
  const root = await mkdtemp(join(tmpdir(), "shield-repository-parity-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const deniedCases = [...DENIED_PATH_CASES, MUTATION_PATH_CASE];
  await writeCases(root, [...deniedCases, ...SAFE_PATH_CASES]);
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const observation = await observeParity(tools, deniedCases);
  assert.deepEqual(parityMismatches(observation, deniedCases), []);
});

test("exact sensitive-segment files have read, list, and search parity", async (context) => {
  const rg = await findRg();
  assert.ok(rg, "trusted rg is required for exact-segment parity acceptance");
  const root = await mkdtemp(join(tmpdir(), "shield-repository-exact-segment-parity-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeCases(root, [...EXACT_SEGMENT_PATH_CASES, ...SAFE_PATH_CASES]);
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const observation = await observeParity(tools, EXACT_SEGMENT_PATH_CASES);
  assert.deepEqual(parityMismatches(observation, EXACT_SEGMENT_PATH_CASES), []);
});

test("simple Unicode case equivalents preserve read, list, and search parity", async (context) => {
  const rg = await findRg();
  assert.ok(rg, "trusted rg is required for Unicode case-equivalence parity acceptance");
  const root = await mkdtemp(join(tmpdir(), "shield-repository-unicode-case-parity-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeCases(root, [...UNICODE_CASE_EQUIVALENT_PATH_CASES, ...SAFE_PATH_CASES]);
  const tools = await createRepositoryTools(root, { rgExecutable: rg });
  const observation = await observeParity(tools, UNICODE_CASE_EQUIVALENT_PATH_CASES);
  assert.deepEqual(parityMismatches(observation, UNICODE_CASE_EQUIVALENT_PATH_CASES), []);
});

test("one-tool source mutations produce only the frozen tool/path/marker mismatch", async (context) => {
  const rg = await findRg();
  assert.ok(rg, "trusted rg is required for sensitive-path mutation acceptance");
  const mutations = [
    {
      tool: "readFile",
      needle: "  readFile: isSensitiveRepositoryPath,",
      replacement: "  readFile: () => false,",
    },
    {
      tool: "listFiles",
      needle: "  listFiles: isSensitiveRepositoryPath,",
      replacement: "  listFiles: () => false,",
    },
    {
      tool: "searchRepo",
      needle: "  searchRepo: SENSITIVE_REPOSITORY_RG_ARGUMENTS,",
      replacement: "  searchRepo: Object.freeze([]),",
    },
  ];

  for (const mutation of mutations) {
    const root = await mkdtemp(join(tmpdir(), `shield-${mutation.tool}-mutation-fixture-`));
    context.after(async () => { await rm(root, { recursive: true, force: true }); });
    await writeCases(root, [MUTATION_PATH_CASE, ...SAFE_PATH_CASES]);

    const mutantModule = await importToolMutant(context, mutation);
    assert.equal(typeof mutantModule.createRepositoryTools, "function");
    const baselineTools = await createRepositoryTools(root, { rgExecutable: rg });
    const mutantTools = await mutantModule.createRepositoryTools(root, { rgExecutable: rg });
    const baseline = await observeParity(baselineTools, [MUTATION_PATH_CASE]);
    const mutated = await observeParity(mutantTools, [MUTATION_PATH_CASE]);

    assert.deepEqual(parityMismatches(baseline, [MUTATION_PATH_CASE]), []);
    if (mutation.tool !== "readFile") assert.deepEqual(mutated.reads, baseline.reads);
    if (mutation.tool !== "listFiles") assert.deepEqual(mutated.list, baseline.list);
    if (mutation.tool !== "searchRepo") {
      assert.deepEqual(
        normalizedSearchObservation(mutated.search),
        normalizedSearchObservation(baseline.search),
      );
    }
    assert.deepEqual(parityMismatches(mutated, [MUTATION_PATH_CASE]), [{
      tool: mutation.tool,
      path: MUTATION_PATH_CASE[0],
      marker: MUTATION_PATH_CASE[1],
      expected: "denied",
      actual: "visible",
    }]);
  }
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
