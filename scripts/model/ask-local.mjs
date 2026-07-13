#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROLE_FILES = {
  orchestrator: "maria-hill-orchestrator.agent.md",
  hill: "maria-hill-orchestrator.agent.md",
  stinger: "maria-hill-orchestrator.agent.md",
  investigator: "daisy-johnson-debugger-recon.agent.md",
  daisy: "daisy-johnson-debugger-recon.agent.md",
  jester: "daisy-johnson-debugger-recon.agent.md",
  architect: "nick-fury-architect.agent.md",
  fury: "nick-fury-architect.agent.md",
  viper: "nick-fury-architect.agent.md",
  implementer: "melinda-may-implementer.agent.md",
  may: "melinda-may-implementer.agent.md",
  iceman: "melinda-may-implementer.agent.md",
  reviewer: "leo-fitz-technical-review.agent.md",
  fitz: "leo-fitz-technical-review.agent.md",
  goose: "leo-fitz-technical-review.agent.md",
  product: "jemma-simmons-product-feedback.agent.md",
  simmons: "jemma-simmons-product-feedback.agent.md",
  human: "phil-coulson-human-player-1.agent.md",
  coulson: "phil-coulson-human-player-1.agent.md",
  maverick: "phil-coulson-human-player-1.agent.md",
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");

export function resolveRoleFile(role) {
  const filename = ROLE_FILES[role.toLowerCase()];
  if (!filename) {
    throw new Error(
      `Unknown role "${role}". Choose: ${Object.keys(ROLE_FILES).join(", ")}`,
    );
  }
  return resolve(repoRoot, "agents", filename);
}

export function parseNativeResponse(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  const message = output.findLast((item) => item?.type === "message")?.content?.trim();
  const reasoning = output
    .filter((item) => item?.type === "reasoning")
    .map((item) => item.content?.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!message) {
    throw new Error("Local model response did not contain a message output.");
  }

  return { message, reasoning, stats: data.stats ?? {} };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
}

function parseArguments(args) {
  const options = {
    role: args[0],
    promptParts: [],
    promptFile: null,
    contextFiles: [],
    outputFile: null,
    showReasoning: false,
    showStats: false,
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file") {
      options.promptFile = args[++index];
    } else if (arg === "--context") {
      options.contextFiles.push(args[++index]);
    } else if (arg === "--output") {
      options.outputFile = args[++index];
    } else if (arg === "--show-reasoning") {
      options.showReasoning = true;
    } else if (arg === "--show-stats") {
      options.showStats = true;
    } else {
      options.promptParts.push(arg);
    }
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.role) {
    throw new Error(
      `Usage: ${basename(process.argv[1])} <role> [prompt] [--file mission.md] [--context path] [--output path] [--show-reasoning] [--show-stats]`,
    );
  }

  const rolePrompt = await readFile(resolveRoleFile(options.role), "utf8");
  const filePrompt = options.promptFile
    ? await readFile(resolve(process.cwd(), options.promptFile), "utf8")
    : "";
  const mission = options.promptParts.join(" ").trim() || filePrompt.trim() || (await readStdin());

  if (!mission) throw new Error("Missing mission prompt.");

  const contextSections = await Promise.all(
    options.contextFiles.map(async (path) => {
      if (!path) throw new Error("--context requires a file path.");
      const absolutePath = resolve(process.cwd(), path);
      return `## ${path}\n\n${await readFile(absolutePath, "utf8")}`;
    }),
  );
  const prompt = contextSections.length
    ? `${mission}\n\nRepository context follows. Treat it as authoritative; do not invent tools, languages, or commands that are not supported by this context.\n\n${contextSections.join("\n\n")}`
    : mission;

  const baseUrl = (process.env.LOCAL_MODEL_BASE_URL ?? "http://127.0.0.1:1234").replace(/\/$/, "");
  const model = process.env.LOCAL_MODEL_ID ?? "ornith-1.0-35b";
  const apiToken = process.env.LOCAL_MODEL_API_TOKEN;
  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
    },
    body: JSON.stringify({
      model,
      system_prompt: rolePrompt,
      input: prompt,
      store: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Local model request failed: ${response.status} ${await response.text()}`);
  }

  const result = parseNativeResponse(await response.json());
  if (options.showReasoning && result.reasoning) {
    console.error(`\n[reasoning]\n${result.reasoning}\n`);
  }
  if (options.showStats) {
    console.error(`\n[stats]\n${JSON.stringify(result.stats, null, 2)}\n`);
  }
  if (options.outputFile) {
    const outputPath = resolve(process.cwd(), options.outputFile);
    await writeFile(outputPath, `${result.message}\n`, "utf8");
    console.log(`Wrote local model response to ${outputPath}`);
  } else {
    console.log(result.message);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
