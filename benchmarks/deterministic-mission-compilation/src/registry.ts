import { base64, canonicalBytes, domainDigest, deepFreeze } from "./canonical.js";
import { IDS, type RegistryBundleV0, type RegistryEntryV0 } from "./contracts.js";

export const REGISTRY_ENTRIES: readonly RegistryEntryV0[] = deepFreeze([
  { id: "OWNERSHIP-01", text: "May retains ownership of the implementation artifact." },
  { id: "AUTHORITY-01", text: "Do not expand the approved scope or create authority." },
  { id: "REVISION-01", text: "Operate only on the exact bound repository revision." },
  { id: "VALIDATION-01", text: "Run the specified focused validation." },
  { id: "VALIDATION-02", text: "Run the specified integration validation." },
  { id: "STOP-01", text: "Stop if the repair requires an architecture change." },
  { id: "STOP-02", text: "Stop if required context or governance state is stale." },
  { id: "OUTPUT-01", text: "Report files changed, tests run, and unresolved risks." },
]);

export function createRegistry(): RegistryBundleV0 {
  const content = { id: IDS.registry, entries: REGISTRY_ENTRIES };
  const bytes = canonicalBytes(content);
  return deepFreeze({
    id: IDS.registry,
    entries: REGISTRY_ENTRIES,
    bytesBase64: base64(bytes),
    digest: domainDigest("shield:dispatch:registry:v0", bytes),
  });
}
