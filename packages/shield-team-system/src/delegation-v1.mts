import { createHash, createPublicKey, verify } from "node:crypto";

export const WHEELS_OFF_SCHEMA_VERSION = 1 as const;
export const WHEELS_OFF_POLICY_ID = "wheels_off.v1" as const;
export const WHEELS_OFF_RULE_IDS = [
  "delegation_active",
  "exact_revisions",
  "bounded_scope",
  "dependencies_satisfied",
  "architecture_resolved",
  "risk_flags_clear",
  "authority_bounded",
  "participants_present",
  "simmons_consistent",
] as const;
export const DELEGATED_INVALIDATION_REASONS = [
  "scope_changed",
  "risk_changed",
  "issue_revision_changed",
  "mission_revision_changed",
  "policy_mismatch",
  "delegation_revoked",
  "delegation_superseded",
] as const;

export type DelegatedInvalidationReason = (typeof DELEGATED_INVALIDATION_REASONS)[number];
export type WheelsOffRuleId = (typeof WHEELS_OFF_RULE_IDS)[number];
export interface Timestamp { value: string; provenance: "humanRecorded" | "hostTrusted"; }
export interface Result<T> { state: "valid"; value: T }
export interface InvalidResult { state: "invalid"; code: string; errors: string[] }
export type ContractResult<T> = Result<T> | InvalidResult;

export interface WheelsOffDelegationContent {
  schemaVersion: 1;
  delegationId: string;
  previousRevisionId: string | null;
  repositoryId: string;
  authorityClass: "mission_initiation";
  policyId: "wheels_off.v1";
  humanPrincipalId: string;
  bindingId: string;
  signingKeyRef: string;
  issuedAt: Timestamp;
  logSequence: number;
}
export interface WheelsOffDelegation extends WheelsOffDelegationContent { revisionId: string; }
export interface WheelsOffRevocation {
  schemaVersion: 1;
  revocationId: string;
  delegationId: string;
  delegationRevisionId: string;
  repositoryId: string;
  reason: string;
  humanPrincipalId: string;
  bindingId: string;
  signingKeyRef: string;
  revokedAt: Timestamp;
  logSequence: number;
}
export interface SignedWheelsOffDelegation { payload: WheelsOffDelegation; signatureBase64: string; }
export interface SignedWheelsOffRevocation { payload: WheelsOffRevocation; signatureBase64: string; }
export type DelegationLogEntry =
  | { schemaVersion: 1; entryId: string; sequence: number; type: "delegation.granted"; timestamp: Timestamp; envelope: SignedWheelsOffDelegation }
  | { schemaVersion: 1; entryId: string; sequence: number; type: "delegation.revoked"; timestamp: Timestamp; envelope: SignedWheelsOffRevocation };
export interface TrustedCoulsonBinding {
  bindingId: string;
  humanPrincipalId: string;
  seatId: string;
  missionScope: string;
  signingKeyRef: string;
  publicKeySpkiBase64: string;
}
export interface DelegationLogProjection {
  entries: DelegationLogEntry[];
  active: WheelsOffDelegation[];
  revokedRevisionIds: string[];
  supersededRevisionIds: string[];
  lastSequence: number;
}
export interface EligibilityDependency { dependencyId: string; revisionId: string; status: "satisfied"; }
export interface EligibilityArchitectureDecision { decisionId: string; revisionId: string; status: "resolved"; }
export interface WheelsOffEligibilityContent {
  schemaVersion: 1;
  eligibilityId: string;
  missionId: string;
  missionRevisionId: string;
  delegationId: string;
  delegationRevisionId: string;
  repositoryId: string;
  issueId: string;
  issueRevisionId: string;
  issueSourceRef: string;
  scopeItems: string[];
  acceptanceChecks: string[];
  dependencies: EligibilityDependency[];
  architecturalDecisions: EligibilityArchitectureDecision[];
  requestedAuthorities: ["implementation", "review_publication"];
  requireSimmons: boolean;
}
export interface WheelsOffEligibility extends WheelsOffEligibilityContent { revisionId: string; }
export interface WheelsOffRuleResult { ruleId: WheelsOffRuleId; state: "satisfied" | "failed"; reasons: string[]; }
export interface WheelsOffEvaluation {
  schemaVersion: 1;
  eligibilityRevisionId: string;
  delegationRevisionId: string;
  missionRevisionId: string;
  result: "eligible" | "ineligible";
  rules: WheelsOffRuleResult[];
  reasons: string[];
}
export interface EligibilityMissionBrief {
  missionId: string;
  revisionId: string;
  requireSimmons: boolean;
  participants: { seatId: string }[];
  riskFlags: object;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const KEY_REF = /^ed25519:sha256:[A-Za-z0-9_-]{43}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const valid = <T,>(value: T): Result<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: string[]): ContractResult<T> => ({ state: "invalid", code, errors });
function plain(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exact(value: unknown, fields: readonly string[], label: string): string[] {
  if (!plain(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields); const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}
function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function timestampErrors(value: unknown, label: string): string[] {
  const errors = exact(value, ["value", "provenance"], label); if (!plain(value)) return errors;
  if (typeof value.value !== "string" || !ISO_UTC.test(value.value) || !Number.isFinite(Date.parse(value.value))) errors.push(`${label}.value is invalid.`);
  if (value.provenance !== "humanRecorded" && value.provenance !== "hostTrusted") errors.push(`${label}.provenance is invalid.`);
  return errors;
}
export function canonicalDelegationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDelegationJson).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalDelegationJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function revision(value: unknown): string { return `sha256:${createHash("sha256").update(canonicalDelegationJson(value)).digest("base64url")}`; }
function withoutRevision<T extends { revisionId: string }>(value: T): Omit<T, "revisionId"> { const { revisionId: _ignored, ...content } = value; return content; }
export function createWheelsOffDelegation(content: WheelsOffDelegationContent): WheelsOffDelegation { return { ...content, revisionId: revision(content) }; }
export function createWheelsOffEligibility(content: WheelsOffEligibilityContent): WheelsOffEligibility { return { ...content, revisionId: revision(content) }; }

export function validateWheelsOffDelegation(input: unknown): ContractResult<WheelsOffDelegation> {
  const fields = ["schemaVersion","delegationId","previousRevisionId","repositoryId","authorityClass","policyId","humanPrincipalId","bindingId","signingKeyRef","issuedAt","logSequence","revisionId"];
  const errors = exact(input, fields, "Delegation"); if (!plain(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Delegation schemaVersion is unsupported.");
  for (const field of ["delegationId","repositoryId","humanPrincipalId","bindingId","revisionId"]) if (!id(input[field])) errors.push(`Delegation ${field} is invalid.`);
  if (input.previousRevisionId !== null && !id(input.previousRevisionId)) errors.push("Delegation previousRevisionId is invalid.");
  if (input.authorityClass !== "mission_initiation") errors.push("Delegation authorityClass is unsupported.");
  if (input.policyId !== WHEELS_OFF_POLICY_ID) errors.push("Delegation policyId is unsupported.");
  if (typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef)) errors.push("Delegation signingKeyRef is invalid.");
  if (!Number.isInteger(input.logSequence) || (input.logSequence as number) < 0) errors.push("Delegation logSequence is invalid.");
  errors.push(...timestampErrors(input.issuedAt, "Delegation issuedAt"));
  if (errors.length > 0) return invalid("malformed", ...errors);
  const value = input as unknown as WheelsOffDelegation;
  return value.revisionId === revision(withoutRevision(value)) ? valid(value) : invalid("revision_mismatch", "Delegation revisionId does not match canonical content.");
}

export function validateWheelsOffRevocation(input: unknown): ContractResult<WheelsOffRevocation> {
  const fields = ["schemaVersion","revocationId","delegationId","delegationRevisionId","repositoryId","reason","humanPrincipalId","bindingId","signingKeyRef","revokedAt","logSequence"];
  const errors = exact(input, fields, "Revocation"); if (!plain(input)) return invalid("malformed", ...errors);
  if (input.schemaVersion !== 1) errors.push("Revocation schemaVersion is unsupported.");
  for (const field of ["revocationId","delegationId","delegationRevisionId","repositoryId","reason","humanPrincipalId","bindingId"]) if (!id(input[field])) errors.push(`Revocation ${field} is invalid.`);
  if (typeof input.signingKeyRef !== "string" || !KEY_REF.test(input.signingKeyRef)) errors.push("Revocation signingKeyRef is invalid.");
  if (!Number.isInteger(input.logSequence) || (input.logSequence as number) < 1) errors.push("Revocation logSequence is invalid.");
  errors.push(...timestampErrors(input.revokedAt, "Revocation revokedAt"));
  return errors.length ? invalid("malformed", ...errors) : valid(input as unknown as WheelsOffRevocation);
}

function verifyEnvelope(payload: unknown, signatureBase64: unknown, binding: TrustedCoulsonBinding): ContractResult<true> {
  if (binding.seatId !== "coulson" || binding.missionScope !== "*") return invalid("delegation_scope_mismatch", "Delegation requires a repository-wide Coulson binding.");
  if (!plain(payload) || payload.humanPrincipalId !== binding.humanPrincipalId || payload.bindingId !== binding.bindingId || payload.signingKeyRef !== binding.signingKeyRef) return invalid("binding_invalid", "Delegation identity does not match the configured Coulson binding.");
  if (typeof signatureBase64 !== "string" || signatureBase64.length === 0) return invalid("binding_invalid", "Delegation signature is missing.");
  try {
    const key = createPublicKey({ key: Buffer.from(binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    return verify(null, Buffer.from(canonicalDelegationJson(payload)), key, Buffer.from(signatureBase64, "base64")) ? valid(true) : invalid("binding_invalid", "Delegation signature verification failed.");
  } catch { return invalid("binding_invalid", "Delegation signature or public key is malformed."); }
}

export function verifyWheelsOffDelegationEnvelope(envelope: unknown, binding: TrustedCoulsonBinding, repositoryId: string): ContractResult<WheelsOffDelegation> {
  const errors=exact(envelope,["payload","signatureBase64"],"Grant envelope"); if(!plain(envelope))return invalid("malformed",...errors);
  if(errors.length)return invalid("malformed",...errors); const checked=validateWheelsOffDelegation(envelope.payload); if(checked.state==="invalid")return checked;
  if(checked.value.repositoryId!==repositoryId)return invalid("delegation_scope_mismatch","Delegation repository does not match.");
  const signed=verifyEnvelope(checked.value,envelope.signatureBase64,binding); return signed.state==="invalid"?signed:valid(checked.value);
}

export function replayDelegationLog(input: unknown, binding: TrustedCoulsonBinding, repositoryId: string): ContractResult<DelegationLogProjection> {
  if (!Array.isArray(input)) return invalid("malformed", "Delegation log must be an array.");
  const entries: DelegationLogEntry[] = []; const active = new Map<string,WheelsOffDelegation>(); const revoked = new Set<string>(); const superseded = new Set<string>(); const entryIds = new Set<string>(); let previousTime = -Infinity;
  for (let sequence=0; sequence<input.length; sequence+=1) {
    const raw=input[sequence]; const errors=exact(raw,["schemaVersion","entryId","sequence","type","timestamp","envelope"],`Delegation entry ${sequence}`); if (!plain(raw)) return invalid("malformed",...errors);
    if (raw.schemaVersion!==1 || raw.sequence!==sequence || !id(raw.entryId) || entryIds.has(String(raw.entryId))) return invalid("sequence_invalid",`Delegation entry ${sequence} is invalid or duplicated.`);
    entryIds.add(String(raw.entryId)); errors.push(...timestampErrors(raw.timestamp,`Delegation entry ${sequence} timestamp`));
    if (!plain(raw.envelope)) errors.push(`Delegation entry ${sequence} envelope is invalid.`); if (errors.length) return invalid("malformed",...errors);
    const envelope=raw.envelope as Record<string,unknown>;
    if (raw.type==="delegation.granted") {
      const envelopeErrors=exact(envelope,["payload","signatureBase64"],"Grant envelope"); if (envelopeErrors.length) return invalid("malformed",...envelopeErrors);
      const checked=validateWheelsOffDelegation(envelope.payload); if (checked.state==="invalid") return checked;
      const grant=checked.value; if (grant.logSequence!==sequence || grant.repositoryId!==repositoryId) return invalid("delegation_scope_mismatch","Delegation sequence or repository does not match.");
      if(canonicalDelegationJson(raw.timestamp)!==canonicalDelegationJson(grant.issuedAt))return invalid("malformed","Delegation entry timestamp does not match its signed payload.");
      const signed=verifyEnvelope(grant,envelope.signatureBase64,binding); if (signed.state==="invalid") return signed;
      const prior=active.get(grant.delegationId);
      if ((prior===undefined && grant.previousRevisionId!==null) || (prior!==undefined && grant.previousRevisionId!==prior.revisionId)) return invalid("delegation_superseded","Delegation previous revision does not match the active revision.");
      if (prior) superseded.add(prior.revisionId); active.set(grant.delegationId,grant);
    } else if (raw.type==="delegation.revoked") {
      const envelopeErrors=exact(envelope,["payload","signatureBase64"],"Revocation envelope"); if (envelopeErrors.length) return invalid("malformed",...envelopeErrors);
      const checked=validateWheelsOffRevocation(envelope.payload); if (checked.state==="invalid") return checked;
      const revocation=checked.value; if (revocation.logSequence!==sequence || revocation.repositoryId!==repositoryId) return invalid("delegation_scope_mismatch","Revocation sequence or repository does not match.");
      if(canonicalDelegationJson(raw.timestamp)!==canonicalDelegationJson(revocation.revokedAt))return invalid("malformed","Revocation entry timestamp does not match its signed payload.");
      const signed=verifyEnvelope(revocation,envelope.signatureBase64,binding); if (signed.state==="invalid") return signed;
      const current=active.get(revocation.delegationId); if (!current || current.revisionId!==revocation.delegationRevisionId) return invalid("delegation_missing","Revocation does not reference the active delegation revision.");
      revoked.add(current.revisionId); active.delete(revocation.delegationId);
    } else return invalid("unsupported_schema",`Delegation entry ${sequence} type is unsupported.`);
    const currentTime=Date.parse((raw.timestamp as unknown as Timestamp).value); if(currentTime<previousTime)return invalid("sequence_invalid","Delegation timestamps move backward."); previousTime=currentTime;
    entries.push(raw as unknown as DelegationLogEntry);
  }
  return valid({entries,active:[...active.values()],revokedRevisionIds:[...revoked],supersededRevisionIds:[...superseded],lastSequence:entries.length-1});
}

export function createDelegationLogEntry(envelope: SignedWheelsOffDelegation | SignedWheelsOffRevocation, type: "delegation.granted"|"delegation.revoked"): DelegationLogEntry {
  const payload=envelope.payload; const sequence=payload.logSequence; const timestamp=type==="delegation.granted"?(payload as WheelsOffDelegation).issuedAt:(payload as WheelsOffRevocation).revokedAt;
  return {schemaVersion:1,entryId:`delegation-entry:${sequence}`,sequence,type,timestamp,envelope} as DelegationLogEntry;
}

export function validateWheelsOffEligibility(input: unknown): ContractResult<WheelsOffEligibility> {
  const fields=["schemaVersion","eligibilityId","missionId","missionRevisionId","delegationId","delegationRevisionId","repositoryId","issueId","issueRevisionId","issueSourceRef","scopeItems","acceptanceChecks","dependencies","architecturalDecisions","requestedAuthorities","requireSimmons","revisionId"];
  const errors=exact(input,fields,"Eligibility"); if(!plain(input)) return invalid("malformed",...errors);
  if(input.schemaVersion!==1) errors.push("Eligibility schemaVersion is unsupported.");
  for(const field of ["eligibilityId","missionId","missionRevisionId","delegationId","delegationRevisionId","repositoryId","issueId","issueRevisionId","issueSourceRef","revisionId"]) if(!id(input[field])) errors.push(`Eligibility ${field} is invalid.`);
  for(const field of ["scopeItems","acceptanceChecks"]){const value=input[field];if(!Array.isArray(value)||value.length===0||value.length>64||value.some((item)=>typeof item!=="string"||item.trim()===""||item.length>512)||new Set(value).size!==value.length) errors.push(`Eligibility ${field} must contain unique bounded non-empty strings.`);}
  const validateRecords=(value:unknown,status:string,label:string)=>{if(!Array.isArray(value)||value.length>64){errors.push(`Eligibility ${label} is invalid.`);return;} const identities=new Set<string>(); value.forEach((record,index)=>{const nested=exact(record,[label==="dependencies"?"dependencyId":"decisionId","revisionId","status"],`${label}[${index}]`);errors.push(...nested);if(plain(record)){const idField=label==="dependencies"?"dependencyId":"decisionId";const identity=String(record[idField]);if(identities.has(identity))errors.push(`${label}[${index}] is duplicated.`);identities.add(identity);if(!id(record[idField])||!id(record.revisionId)||record.status!==status)errors.push(`${label}[${index}] is unresolved or invalid.`);}});};
  validateRecords(input.dependencies,"satisfied","dependencies"); validateRecords(input.architecturalDecisions,"resolved","architecturalDecisions");
  if(canonicalDelegationJson(input.requestedAuthorities)!==canonicalDelegationJson(["implementation","review_publication"])) errors.push("Eligibility requestedAuthorities is unsupported.");
  if(typeof input.requireSimmons!=="boolean") errors.push("Eligibility requireSimmons is invalid.");
  if(errors.length) return invalid("malformed",...errors); const value=input as unknown as WheelsOffEligibility;
  return value.revisionId===revision(withoutRevision(value))?valid(value):invalid("revision_mismatch","Eligibility revisionId does not match canonical content.");
}

export function evaluateWheelsOffEligibility(input:{brief:EligibilityMissionBrief;delegation:WheelsOffDelegation;eligibility:WheelsOffEligibility;repositoryId:string;delegationState:"active"|"revoked"|"superseded"}):ContractResult<WheelsOffEvaluation>{
  const checked=validateWheelsOffEligibility(input.eligibility);if(checked.state==="invalid")return checked; const e=checked.value; const rules:WheelsOffRuleResult[]=[];
  const rule=(ruleId:WheelsOffRuleId,ok:boolean,...reasons:string[])=>rules.push({ruleId,state:ok?"satisfied":"failed",reasons:ok?[]:reasons});
  rule("delegation_active",input.delegationState==="active"&&input.delegation.policyId===WHEELS_OFF_POLICY_ID,input.delegationState==="revoked"?"delegation_revoked":input.delegationState==="superseded"?"delegation_superseded":"delegation_missing");
  rule("exact_revisions",e.missionId===input.brief.missionId&&e.missionRevisionId===input.brief.revisionId&&e.delegationId===input.delegation.delegationId&&e.delegationRevisionId===input.delegation.revisionId&&e.repositoryId===input.repositoryId&&input.delegation.repositoryId===input.repositoryId,"revision_mismatch");
  rule("bounded_scope",e.scopeItems.length>0&&e.acceptanceChecks.length>0,"eligibility_ambiguous");
  rule("dependencies_satisfied",e.dependencies.every((item)=>item.status==="satisfied"),"dependency_unsatisfied");
  rule("architecture_resolved",e.architecturalDecisions.every((item)=>item.status==="resolved"),"architecture_unresolved");
  rule("risk_flags_clear",Object.values(input.brief.riskFlags).every((value)=>value===false),"risk_not_delegable");
  rule("authority_bounded",canonicalDelegationJson(e.requestedAuthorities)===canonicalDelegationJson(["implementation","review_publication"]),"authority_not_delegable");
  const seats=new Set(input.brief.participants.map(({seatId})=>seatId)); rule("participants_present",["coulson","fury","fitz"].every((seat)=>seats.has(seat)),"required_review_seat_missing");
  rule("simmons_consistent",e.requireSimmons===input.brief.requireSimmons&&(!e.requireSimmons||seats.has("simmons")),"simmons_requirement_mismatch");
  const reasons=rules.flatMap((item)=>item.reasons); return valid({schemaVersion:1,eligibilityRevisionId:e.revisionId,delegationRevisionId:input.delegation.revisionId,missionRevisionId:input.brief.revisionId,result:reasons.length?"ineligible":"eligible",rules,reasons});
}
