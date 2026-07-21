import { constructCandidate } from "../dist/experiment.js";

const value = constructCandidate();
process.stdout.write(JSON.stringify({
  controlPrompt: Buffer.from(value.control.bytes).toString("base64"),
  compiledPrompt: Buffer.from(value.compiled.promptBytes).toString("base64"),
  provenance: Buffer.from(value.compiled.provenanceBytes).toString("base64"),
  manifest: Buffer.from(value.compiled.manifestBytes).toString("base64"),
  shared: Buffer.from(value.shared.sharedBytes).toString("base64"),
  wrapper: Buffer.from(value.shared.wrapperBytes).toString("base64"),
  controlEnvelope: Buffer.from(value.controlEnvelope.bytes).toString("base64"),
  compiledEnvelope: Buffer.from(value.compiledEnvelope.bytes).toString("base64"),
}) + "\n");
