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

const baseUrl = process.env.ORNITH_BASE_URL ?? "http://127.0.0.1:1234/v1";
const model = process.env.ORNITH_MODEL ?? "ornith-1.0-35b";
const apiKey = process.env.ORNITH_API_KEY ?? "lm-studio";
const temperature = Number(process.env.ORNITH_TEMPERATURE ?? "0.8");
const maxTokens = Number(process.env.ORNITH_MAX_TOKENS ?? "1600");

const here = dirname(fileURLToPath(import.meta.url));
const rolePath = resolve(here, "..", "roles", `${role}.md`);

async function readStdin() {
  if (process.stdin.isTTY) return "";

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}

async function main() {
  const system = await readFile(rolePath, "utf8").catch((error) => {
    throw new Error(`Unknown role "${role}" at ${rolePath}: ${error.message}`);
  });
  const stdinPrompt = await readStdin();
  const prompt = inlinePrompt || stdinPrompt;

  if (!prompt) {
    throw new Error("Missing prompt. Pass it as an argument or pipe it on stdin.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

