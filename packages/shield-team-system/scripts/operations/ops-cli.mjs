#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const operationsRoot = dirname(fileURLToPath(import.meta.url));
const commands = new Map([
  ["evidence run", "evidence-run.mjs"],
  ["acceptance check", "acceptance-check.mjs"],
  ["flight prep", "flight-prep.mjs"],
  ["fixture build", "fixture-build.mjs"],
  ["construction check", "construction-check.mjs"],
  ["flight doctor", "flight-doctor.mjs"],
  ["flight state-init", "flight-state-init.mjs"],
  ["flight route", "hill-kernel.mjs"],
]);

function usage() {
  return [
    "Usage:",
    "  shield-ops evidence run --spec FILE --expected-spec-sha256 SHA256 --command-id ID --output FILE",
    "  shield-ops acceptance check --spec FILE --manifest FILE --expected-spec-sha256 SHA256 [options]",
    "  shield-ops flight prep MANIFEST.json [--output NEW_DIRECTORY]",
    "  shield-ops fixture build --output NEW_DIRECTORY",
    "  shield-ops construction check --plan FILE [--require-created] [--output NEW_FILE]",
    "  shield-ops flight doctor --plan FILE [--output NEW_FILE]",
    "  shield-ops flight state-init --plan <file> --output <new-file>",
    "  shield-ops flight route --plan <file> --state <file> [--output <file>]",
    "",
    "These commands create non-authoritative operational evidence. They do not grant",
    "mission authority, provenance, execution attestation, journal advancement,",
    "publication, merge, deployment, or release.",
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
  process.stdout.write(`${usage()}\n`);
  process.exitCode = args.length === 0 ? 2 : 0;
} else {
  const commandKey = args.slice(0, 2).join(" ");
  const script = commands.get(commandKey);
  if (script === undefined) {
    process.stderr.write(`SHIELD ops: unsupported command: ${commandKey}\n${usage()}\n`);
    process.exitCode = 2;
  } else {
    const result = spawnSync(process.execPath, [join(operationsRoot, script), ...args.slice(2)], {
      stdio: "inherit",
    });
    if (result.error !== undefined) {
      process.stderr.write(`SHIELD ops: ${result.error.message}\n`);
      process.exitCode = 2;
    } else if (result.signal !== null) {
      process.stderr.write(`SHIELD ops: command terminated by ${result.signal}.\n`);
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
    }
  }
}
