#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashFile, readJson, stableJson, writeNewFile } from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';
const PHASES = new Set(['structure', 'red', 'green']);

const parseArguments = (argv) => {
  const options = { phase: 'structure' };
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--contract') options.contract = argv.shift();
    else if (option === '--phase') options.phase = argv.shift();
    else if (option === '--expected-revision') options.expectedRevision = argv.shift();
    else if (option === '--markdown') options.markdown = argv.shift();
    else if (option === '--report') options.report = argv.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  if (!options.contract) {
    throw new Error(
      'Usage: acceptance-check.mjs --contract FILE [--phase structure|red|green] [--expected-revision SHA] [--markdown FILE] [--report FILE]',
    );
  }
  if (!PHASES.has(options.phase)) throw new Error(`Unknown phase: ${options.phase}`);
  if (options.phase !== 'structure' && !options.expectedRevision) {
    throw new Error(`--expected-revision is required for phase ${options.phase}.`);
  }
  return options;
};

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const validateStructure = (contract) => {
  const errors = [];
  if (contract.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
  if (!nonEmptyString(contract.missionId)) errors.push('missionId is required.');
  if (!nonEmptyString(contract.source?.key)) errors.push('source.key is required.');
  if (!nonEmptyString(contract.source?.sha256)) errors.push('source.sha256 is required.');
  if (!Number.isInteger(contract.source?.criteriaCount) || contract.source.criteriaCount < 1) {
    errors.push('source.criteriaCount must be a positive integer.');
  }
  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
    errors.push('criteria must contain at least one criterion.');
    return errors;
  }
  if (contract.source?.criteriaCount !== contract.criteria.length) {
    errors.push(
      `Source criterion count is ${contract.source?.criteriaCount}; contract contains ${contract.criteria.length}.`,
    );
  }

  const ids = new Set();
  for (const [index, criterion] of contract.criteria.entries()) {
    const prefix = `criteria[${index}]`;
    if (!nonEmptyString(criterion.id)) errors.push(`${prefix}.id is required.`);
    if (ids.has(criterion.id)) errors.push(`Duplicate criterion ID: ${criterion.id}`);
    ids.add(criterion.id);
    if (!nonEmptyString(criterion.sourceText)) errors.push(`${criterion.id}.sourceText is required.`);

    const mode = criterion.validation?.mode;
    if (mode !== 'automated' && mode !== 'manual') {
      errors.push(`${criterion.id}.validation.mode must be automated or manual.`);
      continue;
    }
    if (mode === 'automated') {
      if (!Array.isArray(criterion.validation.testPaths) || criterion.validation.testPaths.length === 0) {
        errors.push(`${criterion.id} automated validation requires testPaths.`);
      }
      if (!Array.isArray(criterion.validation.commands) || criterion.validation.commands.length === 0) {
        errors.push(`${criterion.id} automated validation requires commands.`);
      }
      if (typeof criterion.validation.negativeCaseRequired !== 'boolean') {
        errors.push(`${criterion.id}.validation.negativeCaseRequired must be boolean.`);
      }
      if (
        criterion.validation.negativeCaseRequired === true &&
        (!Array.isArray(criterion.validation.negativeTestPaths) ||
          criterion.validation.negativeTestPaths.length === 0)
      ) {
        errors.push(`${criterion.id} requires negativeTestPaths.`);
      }
    } else {
      if (!Array.isArray(criterion.validation.procedure) || criterion.validation.procedure.length === 0) {
        errors.push(`${criterion.id} manual validation requires a procedure.`);
      }
      if (!nonEmptyString(criterion.validation.expectedResult)) {
        errors.push(`${criterion.id} manual validation requires expectedResult.`);
      }
    }
  }
  return errors;
};

const loadReceipt = async ({ contractDirectory, receiptPath, missionId, expectedRevision }) => {
  const absolutePath = resolve(contractDirectory, receiptPath);
  const receipt = await readJson(absolutePath);
  const errors = [];
  if (receipt.schemaVersion !== 1 || receipt.receiptType !== 'local-command-evidence') {
    errors.push(`${receiptPath} is not a supported evidence receipt.`);
  }
  if (receipt.missionId !== missionId) {
    errors.push(`${receiptPath} mission is ${receipt.missionId}; expected ${missionId}.`);
  }
  if (receipt.git?.after?.head !== expectedRevision) {
    errors.push(`${receiptPath} revision is ${receipt.git?.after?.head}; expected ${expectedRevision}.`);
  }
  if (receipt.git?.after?.dirty !== false) {
    errors.push(`${receiptPath} does not prove a clean exact worktree.`);
  }
  return { path: absolutePath, receipt, errors };
};

const validatePhase = async ({ contract, contractPath, phase, expectedRevision }) => {
  const errors = [];
  const receiptSummaries = [];
  const contractDirectory = dirname(resolve(contractPath));

  for (const criterion of contract.criteria) {
    const mode = criterion.validation.mode;
    const evidence = criterion.evidence ?? {};
    if (mode === 'automated') {
      if (phase === 'red' || phase === 'green') {
        const redPaths = evidence.redReceipts ?? [];
        if (redPaths.length === 0 && !nonEmptyString(criterion.redNotApplicableRationale)) {
          errors.push(`${criterion.id} requires RED evidence or redNotApplicableRationale.`);
        }
        for (const receiptPath of redPaths) {
          const loaded = await loadReceipt({
            contractDirectory,
            receiptPath,
            missionId: contract.missionId,
            expectedRevision: evidence.redRevision ?? expectedRevision,
          }).catch((error) => ({ errors: [error instanceof Error ? error.message : String(error)] }));
          errors.push(...loaded.errors.map((error) => `${criterion.id}: ${error}`));
          if (loaded.receipt) {
            receiptSummaries.push({ criterionId: criterion.id, phase: 'red', path: receiptPath });
            if (loaded.receipt.result?.exitCode === 0) {
              errors.push(`${criterion.id}: RED receipt ${receiptPath} exited successfully.`);
            }
          }
        }
      }

      if (phase === 'green') {
        const greenPaths = evidence.greenReceipts ?? [];
        if (greenPaths.length === 0) errors.push(`${criterion.id} requires GREEN evidence.`);
        for (const receiptPath of greenPaths) {
          const loaded = await loadReceipt({
            contractDirectory,
            receiptPath,
            missionId: contract.missionId,
            expectedRevision,
          }).catch((error) => ({ errors: [error instanceof Error ? error.message : String(error)] }));
          errors.push(...loaded.errors.map((error) => `${criterion.id}: ${error}`));
          if (loaded.receipt) {
            receiptSummaries.push({ criterionId: criterion.id, phase: 'green', path: receiptPath });
            if (loaded.receipt.result?.exitCode !== 0) {
              errors.push(
                `${criterion.id}: GREEN receipt ${receiptPath} exited ${loaded.receipt.result?.exitCode}.`,
              );
            }
          }
        }
      }
    } else if (phase === 'green') {
      const manualEvidence = evidence.manual ?? [];
      if (manualEvidence.length === 0) errors.push(`${criterion.id} requires manual evidence.`);
      for (const [index, item] of manualEvidence.entries()) {
        if (!nonEmptyString(item.performedBy)) {
          errors.push(`${criterion.id} manual evidence ${index + 1} requires performedBy.`);
        }
        if (!nonEmptyString(item.performedAt)) {
          errors.push(`${criterion.id} manual evidence ${index + 1} requires performedAt.`);
        }
        if (item.revision !== expectedRevision) {
          errors.push(
            `${criterion.id} manual evidence ${index + 1} revision is ${item.revision}; expected ${expectedRevision}.`,
          );
        }
        if (!nonEmptyString(item.observation)) {
          errors.push(`${criterion.id} manual evidence ${index + 1} requires observation.`);
        }
      }
    }
  }
  return { errors, receiptSummaries };
};

const makeMarkdown = (report) => {
  const rows = report.criteria.map(
    (criterion) =>
      `| ${criterion.id} | ${criterion.mode} | ${criterion.redEvidence} | ${criterion.greenEvidence} | ${criterion.manualEvidence} |`,
  );
  const errorSection =
    report.errors.length === 0
      ? 'No traceability errors detected.'
      : report.errors.map((error) => `- ${error}`).join('\n');
  return `# Acceptance traceability: ${report.missionId}\n\n` +
    `Phase: **${report.phase}**  \n` +
    `Disposition: **${report.ok ? 'PASS' : 'FAIL'}**  \n` +
    `Expected revision: \`${report.expectedRevision ?? 'not required'}\`\n\n` +
    `| Criterion | Mode | RED receipts | GREEN receipts | Manual records |\n` +
    `| --- | --- | ---: | ---: | ---: |\n${rows.join('\n')}\n\n` +
    `## Findings\n\n${errorSection}\n`;
};

export const checkAcceptance = async ({ contractPath, phase = 'structure', expectedRevision }) => {
  if (!PHASES.has(phase)) throw new Error(`Unknown phase: ${phase}`);
  const contract = await readJson(contractPath);
  const errors = validateStructure(contract);
  let receiptSummaries = [];
  if (errors.length === 0 && phase !== 'structure') {
    const phaseResult = await validatePhase({
      contract,
      contractPath,
      phase,
      expectedRevision,
    });
    errors.push(...phaseResult.errors);
    receiptSummaries = phaseResult.receiptSummaries;
  }

  return {
    schemaVersion: 1,
    reportType: 'acceptance-traceability',
    authority: 'none',
    tool: { name: 'acceptance-check', version: TOOL_VERSION },
    missionId: contract.missionId ?? null,
    source: contract.source ?? null,
    contractPath: resolve(contractPath),
    contractSha256: (await hashFile(contractPath)).sha256,
    phase,
    expectedRevision: expectedRevision ?? null,
    ok: errors.length === 0,
    errors,
    receiptSummaries,
    criteria: (contract.criteria ?? []).map((criterion) => ({
      id: criterion.id,
      sourceText: criterion.sourceText,
      mode: criterion.validation?.mode,
      redEvidence: criterion.evidence?.redReceipts?.length ?? 0,
      greenEvidence: criterion.evidence?.greenReceipts?.length ?? 0,
      manualEvidence: criterion.evidence?.manual?.length ?? 0,
    })),
  };
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const report = await checkAcceptance({
    contractPath: options.contract,
    phase: options.phase,
    expectedRevision: options.expectedRevision,
  });
  const markdown = makeMarkdown(report);
  if (options.markdown) await writeNewFile(options.markdown, markdown);
  if (options.report) await writeNewFile(options.report, stableJson(report));
  process.stdout.write(markdown);
  if (!report.ok) process.exitCode = 2;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
