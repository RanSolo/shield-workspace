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
  if (process.env.SHIELD_FEATURE_FLIGHT_CLI_FIXTURE === "1" &&
      specifier.endsWith("schema9-permission-context-v1.mjs")) {
    const source = "export const loadSchema9PermissionContextV1 = async () => JSON.parse(process.env.SHIELD_FEATURE_FLIGHT_PERMISSION);";
    return { url: `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`, shortCircuit: true };
  }
  if (process.env.SHIELD_FEATURE_FLIGHT_CLI_FIXTURE === "1" &&
      specifier.endsWith("v0.3-fixture-host-launcher.mjs")) {
    const source = `
      import { appendFileSync } from "node:fs";
      export const launchExternalFixture = async () => {
        appendFileSync(process.env.SHIELD_FEATURE_FLIGHT_LAUNCH_LOG, "launch\\n");
        return { state: "ready" };
      };
    `;
    return { url: `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`, shortCircuit: true };
  }
  if (process.env.SHIELD_FEATURE_FLIGHT_MEASUREMENT_UNCERTAIN === "1" &&
      specifier.endsWith("/feature-flight-measurement.mjs")) {
    const source = `
      export const classifyFeatureFlightMeasurementPersistence = ({ outcome, durable }) =>
        outcome === "completed" || outcome === "replayed" || (outcome === "recovery_required" && durable === true) ? "durable" : null;
      export const buildFeatureFlightMeasurementEnvelopeFromProjection = (value) => value;
      export const persistFeatureFlightMeasurement = async () => { throw new Error("measurement_write_uncertain"); };
    `;
    return { url: `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  record({ hook: "load", url, format: context.format ?? null });
  return nextLoad(url, context);
}
