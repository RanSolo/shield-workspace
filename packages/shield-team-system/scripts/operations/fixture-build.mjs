#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
  canonicalNewPath,
  hashFile,
  resolveContainedPath,
  snapshotFile,
  stableJson,
  writeNewFile,
} from './common.mjs';
import { TOOL_VERSION, canonicalRelativePath } from './flight-common.mjs';

const FIXTURE_ID = 'nxt-449-planetpress-replacement-v1';

const crcTable = Array.from({ length: 256 }, (_, start) => {
  let value = start;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};

const makePng = (width, height, pixel) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x += 1) raw.set(pixel(x, y), row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const makePdf = () => {
  const content1 = [
    'q 0.12 0.25 0.48 rg 0 730 612 62 re f Q',
    'BT /F1 20 Tf 36 756 Td (Synthetic Service Summary Template) Tj ET',
    'BT /F1 11 Tf 36 700 Td (Customer: __________________________________________) Tj ET',
    'BT /F1 11 Tf 36 676 Td (Account: ___________________________________________) Tj ET',
    'BT /F1 11 Tf 36 652 Td (Reporting period: ____________________________________) Tj ET',
    '0.6 w 36 610 540 1 re S',
    'BT /F1 10 Tf 36 586 Td (This fixed source page is synthetic and contains no customer data.) Tj ET',
    'BT /F1 9 Tf 36 30 Td (Source page 1 of 2) Tj ET',
  ].join('\n');
  const content2 = [
    'q 0.12 0.25 0.48 rg 0 730 612 62 re f Q',
    'BT /F1 20 Tf 36 756 Td (Synthetic Approval Page) Tj ET',
    'BT /F1 11 Tf 36 690 Td (Variable overlay area:) Tj ET', '0.8 w 36 500 540 170 re S',
    'BT /F1 11 Tf 36 460 Td (Stamp area:) Tj ET', '0.8 w 36 330 220 110 re S',
    'BT /F1 11 Tf 300 460 Td (Signature image area:) Tj ET', '0.8 w 300 330 276 110 re S',
    'BT /F1 9 Tf 36 30 Td (Source page 2 of 2) Tj ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${Buffer.byteLength(content1)} >>\nstream\n${content1}\nendstream`,
    `<< /Length ${Buffer.byteLength(content2)} >>\nstream\n${content2}\nendstream`,
  ];
  let output = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'binary'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, 'binary');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /ID [<4e5854343439464958545552455631><4e5854343439464958545552455631>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'binary');
};

const fixtureData = () => ({
  schemaVersion: 1,
  classification: 'synthetic-test-data',
  customer: {
    name: 'Northwind Demonstration Cooperative', accountId: 'SYNTH-00449',
    contactName: 'Alex Example', address: ['100 Example Avenue', 'Testville, KS 66002'],
  },
  report: {
    title: 'Annual Service and Compliance Summary', period: { start: '2026-01-01', end: '2026-12-31' },
    generatedAt: '2026-08-08T00:00:00Z', showComplianceNotice: true,
    complianceNotice: 'Synthetic fixture notice: review is required for demonstration item EX-017.',
  },
  lineItems: Array.from({ length: 72 }, (_, index) => ({
    id: `EX-${String(index + 1).padStart(3, '0')}`,
    serviceDate: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    description: `Synthetic service record ${index + 1}`,
    quantity: (index % 4) + 1,
    unitPriceCents: 1250 + index * 37,
    status: index === 16 ? 'review' : 'complete',
  })),
  modification: {
    overlayText: 'Account SYNTH-00449 — reviewed 2026-08-08', stampLabel: 'SYNTHETIC APPROVED',
    signerLabel: 'Example Signer — test fixture only', publicTestPassword: 'nxt449-test-only',
  },
});

const syncRegularFile = async (path) => {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Ghostscript output is not a regular file: ${path}`);
  const handle = await open(path, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const fsyncDirectory = async (path) => {
  const handle = await open(path, fsConstants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
};

export const buildFixture = async ({
  outputDirectory,
  ghostscriptCommand = 'gs',
  runGhostscript = execFileSync,
} = {}) => {
  let ghostscriptVersion;
  try {
    ghostscriptVersion = String(runGhostscript(ghostscriptCommand, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  } catch (error) {
    throw new Error(`Ghostscript preflight failed before output creation: ${error instanceof Error ? error.message : error}`);
  }
  if (!/^\d+(?:\.\d+)+/u.test(ghostscriptVersion)) {
    throw new Error(`Ghostscript preflight returned an unsupported version: ${ghostscriptVersion || '<empty>'}`);
  }

  const finalRoot = await canonicalNewPath(outputDirectory);
  if (canonicalRelativePath(basename(finalRoot)) !== basename(finalRoot)) {
    throw new Error(`Fixture directory name is not canonical: ${basename(finalRoot)}`);
  }
  if (await lstat(finalRoot).catch(() => undefined)) throw new Error(`Refusing existing fixture directory: ${finalRoot}`);

  const parent = dirname(finalRoot);
  let stagingRoot;
  let published = false;
  try {
    stagingRoot = await mkdtemp(join(parent, `.${basename(finalRoot)}.staging-`));
    await chmod(stagingRoot, 0o700);
    const coreFiles = [];
    const write = async (name, bytes) => {
      if (canonicalRelativePath(name) !== name || name.includes('/')) throw new Error(`Unsafe fixture filename: ${name}`);
      const path = resolveContainedPath(stagingRoot, name);
      await writeNewFile(path, bytes);
      coreFiles.push(path);
    };

    await write('fixture-data.json', stableJson(fixtureData()));
    await write('brand-mark.png', makePng(240, 80, (x, y) => {
      const blue = x < 72 && ((x - 36) ** 2 + (y - 40) ** 2 < 28 ** 2);
      const stripe = x >= 84 && x <= 224 && y >= 20 && y <= 60 && ((x + y) % 18 < 9);
      return blue ? [31, 78, 121, 255] : stripe ? [67, 116, 154, 255] : [255, 255, 255, 255];
    }));
    await write('signature-placeholder.png', makePng(300, 90, (x, y) => {
      const curve = Math.abs(y - (45 + Math.sin(x / 18) * 20)) < 3 && x > 12 && x < 286;
      const cross = x > 190 && x < 250 && Math.abs(y - (x - 190)) < 2;
      return curve || cross ? [20, 20, 20, 255] : [255, 255, 255, 0];
    }));
    await write('stamp-placeholder.png', makePng(240, 100, (x, y) => {
      const border = x < 5 || x >= 235 || y < 5 || y >= 95;
      const diagonal = Math.abs(y - (x * 0.34 + 8)) < 4 || Math.abs(y - ((240 - x) * 0.34 + 8)) < 4;
      return border || diagonal ? [180, 25, 25, 220] : [255, 255, 255, 0];
    }));
    const sourcePdfPath = resolveContainedPath(stagingRoot, 'source-template.pdf');
    await write('source-template.pdf', makePdf());
    await write('malformed-input.pdf', Buffer.from('%PDF-1.7\nThis fixture is intentionally truncated and malformed.\n', 'utf8'));

    const encryptedPath = resolveContainedPath(stagingRoot, 'encrypted-input.pdf');
    runGhostscript(ghostscriptCommand, [
      '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
      '-dEncryptionR=3', '-dKeyLength=128', '-sOwnerPassword=nxt449-owner-test-only',
      '-sUserPassword=nxt449-test-only', `-sOutputFile=${encryptedPath}`, sourcePdfPath,
    ], { stdio: 'pipe' });
    await syncRegularFile(encryptedPath);
    coreFiles.push(encryptedPath);

    await write('expected-observations.json', stableJson({
      schemaVersion: 1,
      fullDocument: {
        minimumPages: 2, requiredLineItemIds: ['EX-001', 'EX-017', 'EX-072'], requireHeaderFooter: true,
        requireStablePageNumbers: true, requireReopen: true,
      },
      modification: {
        sourcePageCount: 2, sourceMediaBoxPoints: [0, 0, 612, 792], requireOverlayText: true,
        requireStampImage: true, requireSignatureImage: true, requirePreservedPageDimensions: true,
        malformedInputMustNotSilentlySucceed: true, encryptedInputMustBeRecorded: true,
      },
    }));
    await write('README.md', `# ${FIXTURE_ID}\n\nThis closed fixture contains only synthetic, programmatically generated test data. It contains no customer data, company branding, copied fonts, private keys, credentials, or human signatures. The encrypted negative-test PDF uses a public test password.\n`);

    const files = [];
    for (const path of coreFiles) {
      const hashed = await hashFile(path);
      files.push({ path: basename(path), bytes: hashed.bytes, sha256: hashed.sha256 });
    }
    files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const manifest = {
      schemaVersion: 1,
      manifestType: 'synthetic-pdf-fixture',
      fixtureId: FIXTURE_ID,
      fixtureVersion: 1,
      classification: 'synthetic-test-data',
      containsCustomerData: false,
      containsCredentials: false,
      assetProvenance: 'programmatically-generated-for-this-test-fixture',
      intendedUse: 'NXT-449 comparative PDF library spike only',
      files,
    };
    const manifestPath = resolveContainedPath(stagingRoot, 'fixture-manifest.json');
    await writeNewFile(manifestPath, stableJson(manifest));
    const manifestHash = await hashFile(manifestPath);
    const toolSnapshot = await snapshotFile(fileURLToPath(import.meta.url));
    const receipt = {
      schemaVersion: 1,
      receiptType: 'synthetic-fixture-build',
      authority: 'none',
      fixtureId: FIXTURE_ID,
      fixtureVersion: 1,
      manifest: { path: 'fixture-manifest.json', bytes: manifestHash.bytes, sha256: manifestHash.sha256 },
      tool: { path: toolSnapshot.path, version: TOOL_VERSION, bytes: toolSnapshot.size, sha256: toolSnapshot.sha256 },
      ghostscriptVersion,
    };
    await writeNewFile(resolveContainedPath(stagingRoot, 'build-receipt.json'), stableJson(receipt));
    await fsyncDirectory(stagingRoot);

    if (await lstat(finalRoot).catch(() => undefined)) throw new Error(`Refusing existing fixture directory: ${finalRoot}`);
    await rename(stagingRoot, finalRoot);
    published = true;
    stagingRoot = undefined;
    await fsyncDirectory(parent);
    return {
      output: finalRoot,
      manifest,
      manifestHash: { path: resolveContainedPath(finalRoot, 'fixture-manifest.json'), bytes: manifestHash.bytes, sha256: manifestHash.sha256 },
    };
  } catch (error) {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    if (published) await rm(finalRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.shift() !== '--output' || argv.length !== 1) throw new Error('Usage: shield-ops fixture build --output NEW_DIRECTORY');
  const result = await buildFixture({ outputDirectory: argv[0] });
  process.stdout.write(stableJson({ output: result.output, manifest: result.manifestHash }));
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
