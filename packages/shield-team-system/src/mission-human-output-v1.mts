type HumanAuthorizationManifest = {
  schemaId: string;
  missionId: string;
  implementationAuthority: {
    seatId?: string;
    approvedActionIds?: readonly string[];
    approvedCapabilities?: readonly string[];
    approvedRelativePaths?: readonly string[];
  };
  publicationAuthority: { permittedEffects?: readonly string[] };
  exclusions?: readonly string[];
  remainingHumanGates?: readonly string[];
};

type HumanAuthorizationReceipt = {
  schemaId: string;
  missionId: string;
  remainingHumanGates?: readonly string[];
};

const HUMAN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  final_acceptance: "final acceptance",
  product_domain_review: "product/domain review",
  technical_review: "technical review",
});

function displayToken(value: string): string {
  return value
    .replace(/^(?:action|effect|review):/u, "")
    .replaceAll(/[._:-]+/gu, " ")
    .trim();
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function gateLine(gate: string): string {
  const [seat, ...kindParts] = gate.split(".");
  const kind = kindParts.join("_");
  return `- ${capitalize(seat)}: ${HUMAN_LABELS[kind] ?? displayToken(kind)}`;
}

function scopeLines(manifest: HumanAuthorizationManifest): string[] {
  const authority = manifest.implementationAuthority;
  const lines = (authority.approvedActionIds ?? []).map((action) => `- ${capitalize(displayToken(action))}`);
  const pathCount = authority.approvedRelativePaths?.length ?? 0;
  if (pathCount > 0) lines.push(`- Change ${pathCount} approved path${pathCount === 1 ? "" : "s"}`);
  const capabilities = (authority.approvedCapabilities ?? []).map(displayToken);
  if (capabilities.length > 0) lines.push(`- Use: ${capabilities.join(", ")}`);
  for (const effect of manifest.publicationAuthority.permittedEffects ?? []) {
    lines.push(`- ${capitalize(displayToken(effect))}`);
  }
  return lines;
}

function remainingGateLines(gates: readonly string[] | undefined): string[] {
  if (!gates || gates.length === 0) return [];
  return ["Still requires later human decisions:", ...gates.map(gateLine)];
}

export function renderAuthorizeWheelsUpHumanV1(manifest: HumanAuthorizationManifest): string {
  const seat = capitalize(manifest.implementationAuthority.seatId ?? "may");
  const lines = [
    `APPROVAL NEEDED — ${manifest.missionId}`,
    `Enter your passcode to authorize ${seat} to:`,
    ...scopeLines(manifest),
  ];
  const exclusions = (manifest.exclusions ?? []).map(displayToken);
  if (exclusions.length > 0) lines.push("Not authorized:", `- ${exclusions.join(", ")}`);
  lines.push(...remainingGateLines(manifest.remainingHumanGates));
  lines.push("Decision: enter the passcode to approve, or cancel to decline.");
  return lines.join("\n");
}

export function renderAuthorizeWheelsUpReceiptHumanV1(receipt: HumanAuthorizationReceipt): string {
  return [
    `AUTHORIZED — ${receipt.missionId}`,
    "May implementation, validation, runtime binding, and initial draft publication are authorized.",
    ...remainingGateLines(receipt.remainingHumanGates),
  ].join("\n");
}
