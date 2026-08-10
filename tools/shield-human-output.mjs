#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const MANIFEST_BEGIN = "SHIELD_WHEELS_UP_MANIFEST_BEGIN";
const MANIFEST_END = "SHIELD_WHEELS_UP_MANIFEST_END";
const HUMAN_LABELS = Object.freeze({
  final_acceptance: "final acceptance",
  mission_authorization: "mission authorization",
  technical_review: "technical review",
});

const displayToken = (value) => String(value ?? "")
  .replace(/^(?:action|effect|review):/u, "")
  .replaceAll(/[._:-]+/gu, " ")
  .trim();

const capitalize = (value) => value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;

const extractBalancedJson = (text, start) => {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
};

const parseJson = (value) => {
  try { return JSON.parse(value); }
  catch { return undefined; }
};

export const extractWheelsUpManifests = (text) => {
  const manifests = [];
  let cursor = 0;
  while (cursor < text.length) {
    const framedStart = text.indexOf(MANIFEST_BEGIN, cursor);
    const humanStart = text.indexOf("Authorize Wheels Up manifest:", cursor);
    if (framedStart === -1 && humanStart === -1) break;
    if (framedStart !== -1 && (humanStart === -1 || framedStart < humanStart)) {
      const contentStart = framedStart + MANIFEST_BEGIN.length;
      const end = text.indexOf(MANIFEST_END, contentStart);
      if (end === -1) break;
      const parsed = parseJson(text.slice(contentStart, end).trim());
      if (parsed) manifests.push(parsed);
      cursor = end + MANIFEST_END.length;
      continue;
    }
    const objectStart = text.indexOf("{", humanStart);
    if (objectStart === -1) break;
    const json = extractBalancedJson(text, objectStart);
    if (!json) break;
    const parsed = parseJson(json);
    if (parsed) manifests.push(parsed);
    cursor = objectStart + json.length;
  }
  return manifests;
};

export const extractPendingHumanEvidence = (text) => {
  const requests = [];
  for (const match of text.matchAll(/^Pending human evidence:\s*(.+)$/gmu)) {
    for (const raw of match[1].split(/,\s*/u)) {
      const parsed = raw.match(/^([^:]+):pending:req:(.+):(sha256:[^:]+):([^:]+)$/u);
      if (!parsed) continue;
      requests.push({ seat: parsed[1], missionId: parsed[2], revision: parsed[3], kind: parsed[4] });
    }
  }
  return requests;
};

const manifestSummary = (manifest) => {
  if (manifest?.schemaId !== "shield.wheels-up-authorization-manifest.v1") return undefined;
  const authority = manifest.implementationAuthority ?? {};
  const publication = manifest.publicationAuthority ?? {};
  return {
    missionId: manifest.missionId,
    seat: authority.seatId ?? "may",
    pathCount: Array.isArray(authority.approvedRelativePaths) ? authority.approvedRelativePaths.length : 0,
    actions: Array.isArray(authority.approvedActionIds) ? authority.approvedActionIds.map(displayToken) : [],
    capabilities: Array.isArray(authority.approvedCapabilities) ? authority.approvedCapabilities.map(displayToken) : [],
    publicationEffects: Array.isArray(publication.permittedEffects) ? publication.permittedEffects.map(displayToken) : [],
    exclusions: Array.isArray(manifest.exclusions) ? manifest.exclusions.map(displayToken) : [],
    remainingGates: Array.isArray(manifest.remainingHumanGates) ? manifest.remainingHumanGates : [],
  };
};

const gateParts = (gate) => {
  const [seat, ...kindParts] = String(gate).split(".");
  const kind = kindParts.join("_");
  return { seat, kind };
};

export const renderHumanActions = (text) => {
  const manifests = extractWheelsUpManifests(text).map(manifestSummary).filter(Boolean)
    .filter((manifest, index, all) => all.findIndex((candidate) =>
      candidate.missionId === manifest.missionId &&
      JSON.stringify(candidate) === JSON.stringify(manifest)) === index);
  const pending = extractPendingHumanEvidence(text);
  const lines = [];
  const seen = new Set();

  for (const manifest of manifests) {
    lines.push(`APPROVAL NEEDED — ${manifest.missionId}`);
    lines.push(`Enter your passcode to authorize ${capitalize(manifest.seat)} to:`);
    for (const action of manifest.actions) lines.push(`- ${capitalize(action)}`);
    if (manifest.pathCount > 0) lines.push(`- Change ${manifest.pathCount} approved path${manifest.pathCount === 1 ? "" : "s"}`);
    if (manifest.capabilities.length > 0) lines.push(`- Use: ${manifest.capabilities.join(", ")}`);
    for (const effect of manifest.publicationEffects) lines.push(`- ${capitalize(effect)}`);
    if (manifest.exclusions.length > 0) {
      lines.push("Not authorized:");
      lines.push(`- ${manifest.exclusions.join(", ")}`);
    }
    if (manifest.remainingGates.length > 0) {
      lines.push("Still requires later human decisions:");
      for (const gate of manifest.remainingGates) {
        const { seat, kind } = gateParts(gate);
        lines.push(`- ${capitalize(seat)}: ${HUMAN_LABELS[kind] ?? displayToken(kind)}`);
        seen.add(`${manifest.missionId}|${seat}|${kind}`);
      }
    }
    lines.push("Decision: enter the passcode to approve, or cancel to decline.");
    lines.push("");
  }

  const remaining = pending.filter(({ missionId, seat, kind }) => !seen.has(`${missionId}|${seat}|${kind}`));
  if (remaining.length > 0) {
    lines.push("PENDING HUMAN DECISIONS");
    for (const request of remaining) {
      lines.push(`- ${request.missionId} — ${capitalize(request.seat)}: ${HUMAN_LABELS[request.kind] ?? displayToken(request.kind)}`);
    }
  }

  while (lines.at(-1) === "") lines.pop();
  return lines.length > 0 ? `${lines.join("\n")}\n` : "No human action required.\n";
};

const renderStreamingStdin = async () => {
  let text = "";
  let lastRendered = "";
  for await (const chunk of process.stdin) {
    text += chunk.toString("utf8");
    const rendered = renderHumanActions(text);
    if (rendered !== "No human action required.\n" && rendered !== lastRendered) {
      process.stdout.write(rendered);
      lastRendered = rendered;
    }
  }
  if (lastRendered === "") process.stdout.write("No human action required.\n");
};

const main = async () => {
  const paths = process.argv.slice(2);
  if (paths.includes("--help") || paths.includes("-h")) {
    process.stdout.write("Usage: shield-human-output [TRANSCRIPT ...]\n       COMMAND 2>&1 | shield-human-output\n");
    return;
  }
  if (paths.length === 0) {
    await renderStreamingStdin();
    return;
  }
  const text = (await Promise.all(paths.map((path) => readFile(resolve(path), "utf8")))).join("\n");
  process.stdout.write(renderHumanActions(text));
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`shield-human-output: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
