import { appendFileSync } from "node:fs";

const record = (event) => {
  const path = process.env.SHIELD_FEATURE_FLIGHT_LOADER_LOG;
  if (path) appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
};

export async function resolve(specifier, context, nextResolve) {
  const adapterPathname = specifier.endsWith("/benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs");
  const followedFromCapturedAdapter = context.parentURL?.startsWith("data:text/javascript;base64,") &&
    !specifier.startsWith("data:") && !specifier.startsWith("node:");
  record({ hook: "resolve", specifier, parentURL: context.parentURL ?? null, adapterPathname, followedFromCapturedAdapter });
  if (adapterPathname) throw new Error("feature_flight_adapter_pathname_reopen_forbidden");
  if (followedFromCapturedAdapter) throw new Error("feature_flight_adapter_external_module_follow_forbidden");
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  record({ hook: "load", url, format: context.format ?? null });
  return nextLoad(url, context);
}
