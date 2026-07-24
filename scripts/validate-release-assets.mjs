import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function fail(message) {
  console.error(`Release validation failed: ${message}`);
  process.exit(1);
}

const manifestPath = resolve(process.argv[2] ?? '.release/manifest.json');
const assetsDirectory = resolve(process.argv[3] ?? '.release');
const trustedKeysPath = resolve(process.argv[4] ?? 'config/trusted-keys.json');

let manifest;
let trustedKeys;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  trustedKeys = JSON.parse(await readFile(trustedKeysPath, 'utf8'));
} catch (error) {
  fail(`cannot read validation inputs: ${error.message}`);
}

const requiredTopLevel = [
  'manifestSchemaVersion',
  'channel',
  'dataRevision',
  'dataVersion',
  'displayName',
  'publishedAt',
  'minAppVersionCode',
  'requiredCapabilities',
  'pack',
  'notes',
];

for (const field of requiredTopLevel) {
  if (manifest[field] === undefined || manifest[field] === null) {
    fail(`manifest field ${field} is required`);
  }
}

if (manifest.manifestSchemaVersion !== 1) fail('manifestSchemaVersion must equal 1');
if (!['stable', 'beta', 'internal'].includes(manifest.channel)) fail('invalid channel');
if (!Number.isInteger(manifest.dataRevision) || manifest.dataRevision < 1) fail('dataRevision must be a positive integer');
if (typeof manifest.dataVersion !== 'string' || !manifest.dataVersion.trim()) fail('dataVersion is required');
if (typeof manifest.displayName !== 'string' || !manifest.displayName.trim()) fail('displayName is required');
if (Number.isNaN(Date.parse(manifest.publishedAt))) fail('publishedAt must be an ISO-8601 date-time');
if (!Number.isInteger(manifest.minAppVersionCode) || manifest.minAppVersionCode < 0) fail('minAppVersionCode must be a non-negative integer');
if (!Array.isArray(manifest.requiredCapabilities) || new Set(manifest.requiredCapabilities).size !== manifest.requiredCapabilities.length) {
  fail('requiredCapabilities must be a unique array');
}
if (!Array.isArray(manifest.notes)) fail('notes must be an array');

const pack = manifest.pack;
for (const field of ['url', 'sizeBytes', 'sha256', 'signature', 'signatureAlgorithm', 'signaturePayload', 'signatureKeyId']) {
  if (pack?.[field] === undefined || pack?.[field] === null || pack?.[field] === '') {
    fail(`pack field ${field} is required`);
  }
}

if (!Number.isInteger(pack.sizeBytes) || pack.sizeBytes < 1) fail('pack.sizeBytes must be a positive integer');
if (!/^[a-f0-9]{64}$/.test(pack.sha256)) fail('pack.sha256 must be a lowercase SHA-256 digest');
if (pack.signatureAlgorithm !== 'ed25519') fail('pack.signatureAlgorithm must equal ed25519');
if (pack.signaturePayload !== 'sha256') fail('pack.signaturePayload must equal sha256');

const releaseTag = `rules-data-${manifest.dataVersion}`;
const expectedUrl = `https://github.com/Cataphracti/noosphere-rules-data/releases/download/${releaseTag}/noosphere-rules-pack.zip`;
if (pack.url !== expectedUrl) fail(`pack.url must equal ${expectedUrl}`);

const trustedKey = trustedKeys.find((candidate) => candidate.keyId === pack.signatureKeyId);
if (!trustedKey) fail(`unknown signature key: ${pack.signatureKeyId}`);
if (trustedKey.algorithm !== 'ed25519') fail(`unsupported trusted key algorithm: ${trustedKey.algorithm}`);
if (!trustedKey.channels.includes(manifest.channel)) {
  fail(`key ${trustedKey.keyId} is not allowed for channel ${manifest.channel}`);
}

const packPath = join(assetsDirectory, 'noosphere-rules-pack.zip');
let packBytes;
try {
  packBytes = await readFile(packPath);
} catch (error) {
  fail(`cannot read pack asset ${packPath}: ${error.message}`);
}

const packStat = await stat(packPath);
if (packStat.size !== pack.sizeBytes) {
  fail(`pack size mismatch: manifest=${pack.sizeBytes}, actual=${packStat.size}`);
}

const digest = createHash('sha256').update(packBytes).digest();
const actualSha256 = digest.toString('hex');
if (actualSha256 !== pack.sha256) {
  fail(`pack SHA-256 mismatch: manifest=${pack.sha256}, actual=${actualSha256}`);
}

let publicKey;
let signature;
try {
  const rawPublicKey = Buffer.from(trustedKey.publicKeyBase64, 'base64');
  if (rawPublicKey.length !== 32) fail(`trusted Ed25519 public key must be 32 bytes: ${trustedKey.keyId}`);
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  publicKey = createPublicKey({
    key: Buffer.concat([spkiPrefix, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
  signature = Buffer.from(pack.signature, 'base64');
} catch (error) {
  fail(`cannot decode signature material: ${error.message}`);
}

if (!verify(null, digest, publicKey, signature)) {
  fail(`Ed25519 signature verification failed for ${trustedKey.keyId}`);
}

console.log(`Validated ${releaseTag}`);
console.log(`Channel: ${manifest.channel}`);
console.log(`Revision: ${manifest.dataRevision}`);
console.log(`Bytes: ${pack.sizeBytes}`);
console.log(`SHA-256: ${actualSha256}`);
console.log(`Signature key: ${trustedKey.keyId}`);
