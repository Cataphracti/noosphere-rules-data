import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

function fail(message) {
  console.error(`Release validation failed: ${message}`);
  process.exit(1);
}

const manifestPath = resolve(process.argv[2] ?? '.release/manifest.json');
const assetsDirectory = resolve(process.argv[3] ?? '.release');

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  fail(`cannot read or parse ${manifestPath}: ${error.message}`);
}

const requiredTopLevel = [
  'schemaVersion',
  'channel',
  'releaseId',
  'releaseTag',
  'publishedAt',
  'minimumAppVersion',
  'minimumAppBuild',
  'dataSchemaVersion',
  'pack',
];

for (const field of requiredTopLevel) {
  if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
    fail(`manifest field ${field} is required`);
  }
}

if (manifest.schemaVersion !== 1) fail('schemaVersion must equal 1');
if (!['production', 'beta'].includes(manifest.channel)) fail('channel must be production or beta');
if (!/^rules-v[A-Za-z0-9._-]+$/.test(manifest.releaseTag)) fail('releaseTag has an invalid format');
if (Number.isNaN(Date.parse(manifest.publishedAt))) fail('publishedAt must be an ISO-8601 date-time');
if (!Number.isInteger(manifest.minimumAppBuild) || manifest.minimumAppBuild < 1) fail('minimumAppBuild must be a positive integer');
if (!Number.isInteger(manifest.dataSchemaVersion) || manifest.dataSchemaVersion < 1) fail('dataSchemaVersion must be a positive integer');

const pack = manifest.pack;
for (const field of ['format', 'fileName', 'url', 'sha256', 'sizeBytes']) {
  if (pack?.[field] === undefined || pack?.[field] === null || pack?.[field] === '') {
    fail(`pack field ${field} is required`);
  }
}

if (pack.format !== 'noosphere-rules-pack-v1') fail('pack.format must equal noosphere-rules-pack-v1');
if (!/^noosphere-rules-pack-[A-Za-z0-9._-]+\.zip$/.test(pack.fileName)) fail('pack.fileName has an invalid format');
if (!/^[a-f0-9]{64}$/.test(pack.sha256)) fail('pack.sha256 must be a lowercase SHA-256 hex digest');
if (!Number.isInteger(pack.sizeBytes) || pack.sizeBytes < 1) fail('pack.sizeBytes must be a positive integer');

const expectedUrl = `https://github.com/Cataphracti/noosphere-rules-data/releases/download/${manifest.releaseTag}/${pack.fileName}`;
if (pack.url !== expectedUrl) fail(`pack.url must equal ${expectedUrl}`);

const packPath = join(assetsDirectory, basename(pack.fileName));
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

const actualSha256 = createHash('sha256').update(packBytes).digest('hex');
if (actualSha256 !== pack.sha256) {
  fail(`pack SHA-256 mismatch: manifest=${pack.sha256}, actual=${actualSha256}`);
}

console.log(`Validated ${manifest.releaseTag}`);
console.log(`Pack: ${pack.fileName}`);
console.log(`Bytes: ${pack.sizeBytes}`);
console.log(`SHA-256: ${actualSha256}`);
