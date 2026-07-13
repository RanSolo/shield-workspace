#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const role = process.argv[2];
const inlinePrompt = process.argv.slice(3).join(" ").trim();

if (!role) {
  console.error("Usage: node .agents/harness/ask-ornith.mjs <role> [prompt]");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(here, "..", "config", "models.json");

function resolveEnvValue(name, fallback) {
  if (!name) return fallback;
  return process.env[name] ?? fallback;
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function loadConfig() {
  const raw = await readFile(configPath, "utf8").catch((error) => {
    throw new Error(`Missing model config at ${configPath}: ${error.message}`);
  });

  return JSON.parse(raw);
}

async function readStdin() {
  if (process.stdin.isTTY) return "";

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}

async function main() {
  const config = await loadConfig();
  const resolvedRole = config.roleAliases?.[role] ?? role;
  const rolePath = resolve(here, "..", "roles", `${resolvedRole}.md`);

  const system = await readFile(rolePath, "utf8").catch((error) => {
    throw new Error(`Unknown role "${role}" at ${rolePath}: ${error.message}`);
  });
  const stdinPrompt = await readStdin();
  const prompt = inlinePrompt || stdinPrompt;

  if (!prompt) {
    throw new Error("Missing prompt. Pass it as an argument or pipe it on stdin.");
  }

  const defaults = config.defaults ?? {};
  const modelConfig = config.models?.[role] ?? config.models?.[resolvedRole];

  if (!modelConfig) {
    throw new Error(`Missing model mapping for role "${role}" in ${configPath}.`);
  }

  const providerName = modelConfig.provider ?? defaults.provider;
  const provider = config.providers?.[providerName];

  if (!provider) {
    throw new Error(`Unknown provider "${providerName}" for role "${role}".`);
  }

  const baseUrl = trimTrailingSlash(
    resolveEnvValue(provider.baseUrlEnv, provider.baseUrl ?? ""),
  );
  const apiKey = resolveEnvValue(provider.apiKeyEnv, provider.apiKey ?? "");
  const model = resolveEnvValue(modelConfig.modelEnv, modelConfig.model);
  const temperature = Number(process.env.MODEL_TEMPERATURE ?? defaults.temperature ?? "0.8");
  const maxTokens = Number(process.env.MODEL_MAX_TOKENS ?? defaults.maxTokens ?? "1600");
  const chatPath = provider.chatCompletionsPath ?? "/chat/completions";

  if (!baseUrl) {
    throw new Error(`Missing base URL for provider "${providerName}".`);
  }

  if (!model) {
    throw new Error(`Missing model name for role "${role}".`);
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}${chatPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ornith request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message ?? {};
  const content = message.content?.trim();
  const fallback = message.reasoning_content?.trim();

  if (content) {
    console.log(content);
    return;
  }

  if (fallback) {
    console.log(fallback);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
