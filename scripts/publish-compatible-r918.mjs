#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [sourceArchivePath, outputDirectory] = process.argv.slice(2);
if (!sourceArchivePath || !outputDirectory) {
  throw new Error("Usage: publish-compatible-r918.mjs <source-archive> <output-directory>");
}

const TARGET = {
  dataRevision: 918,
  dataVersion: "balance-2026.08-r918",
  displayName: "Балансные правки — август 2026",
  publishedAt: "2026-08-27T20:42:28Z",
  minAppVersionCode: 158,
  channel: "stable",
  signatureKeyId: "rules-2026-v1",
  packUrl: "https://github.com/Cataphracti/noosphere-rules-data/releases/download/rules-data-balance-2026.08-r918/noosphere-rules-pack.zip",
  notes: [
    "Обновлена стоимость юнитов и составов отрядов.",
    "Обновлена стоимость отдельных улучшений и отрядов.",
    "Существующие ростеры сохраняются и автоматически пересчитываются."
  ]
};

const COMPATIBLE_CAPABILITIES = [
  "catalog-runtime-v1",
  "entity-lifecycle-v1",
  "unit-composition-v1",
  "validation-rules-v1",
  "attachment-rules-v1",
  "wargear-points-v1",
  "official-source-data-version-v1",
  "source-complete-runtime-v2",
  "battle-scoring-v1",
  "localization-v1"
];

const FIXED_DOS_DATE = 0x0021;
const FIXED_DOS_TIME = 0x0000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readZip(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const expectedCrc = buffer.readUInt32LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8
      ? zlib.inflateRawSync(compressed)
      : method === 0
        ? compressed
        : undefined;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method}.`);
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) {
      throw new Error(`Corrupt ZIP entry: ${name}`);
    }
    if (entries.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

function localFileHeader(name, crc, compressedSize, uncompressedSize) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(FIXED_DOS_TIME, 10);
  header.writeUInt16LE(FIXED_DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryHeader(name, crc, compressedSize, uncompressedSize, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(FIXED_DOS_TIME, 12);
  header.writeUInt16LE(FIXED_DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endOfCentralDirectory(count, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(count, 8);
  footer.writeUInt16LE(count, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

function createZip(entries) {
  const normalized = [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath: entryPath.replace(/\\/g, "/"), data }))
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of normalized) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.json$/.test(entry.entryPath) ||
      entry.entryPath.includes("..") ||
      entry.entryPath.startsWith("/")
    ) {
      throw new Error(`Unsafe archive entry: ${entry.entryPath}`);
    }
    const name = Buffer.from(entry.entryPath, "utf8");
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);
    const local = localFileHeader(name, crc, compressed.length, entry.data.length);
    localParts.push(local, name, compressed);
    centralParts.push(
      centralDirectoryHeader(name, crc, compressed.length, entry.data.length, offset),
      name
    );
    offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endOfCentralDirectory(normalized.length, central.length, offset)
  ]);
}

function jsonEntry(entries, entryPath) {
  const value = entries.get(entryPath);
  if (!value) throw new Error(`Required entry is missing: ${entryPath}`);
  return JSON.parse(value.toString("utf8"));
}

function writeJsonEntry(entries, entryPath, value) {
  entries.set(entryPath, Buffer.from(canonicalJson(value), "utf8"));
}

function loadPrivateKey(value) {
  if (!value) throw new Error("RULES_DATA_ED25519_PRIVATE_KEY_BASE64 is unavailable.");
  const decoded = Buffer.from(value.trim(), "base64");
  const text = decoded.toString("utf8");
  if (text.includes("BEGIN PRIVATE KEY")) return crypto.createPrivateKey(text);
  return crypto.createPrivateKey({ key: decoded, format: "der", type: "pkcs8" });
}

function assertMobileSplitContract(entries, manifest) {
  const metadata = jsonEntry(entries, "metadata/pack.json");
  assert.equal(metadata.dataRevision, TARGET.dataRevision);
  assert.equal(metadata.dataVersion, TARGET.dataVersion);
  assert.equal(metadata.minAppVersionCode, TARGET.minAppVersionCode);
  assert.deepEqual(metadata.requiredCapabilities, COMPATIBLE_CAPABILITIES);
  assert.deepEqual(manifest.requiredCapabilities, COMPATIBLE_CAPABILITIES);
  assert.equal(manifest.dataRevision, metadata.dataRevision);
  assert.equal(manifest.dataVersion, metadata.dataVersion);

  const requiredPaths = [
    "catalog/factions.json",
    "catalog/datasheets.json",
    "catalog/model-profiles.json",
    "catalog/weapons.json",
    "catalog/abilities.json",
    "catalog/battle-sizes.json",
    "catalog/availability.json",
    "rules/faction-rules.json",
    "rules/army-rules.json",
    "rules/detachments.json",
    "rules/enhancements.json",
    "rules/stratagems.json",
    "rules/attachments.json",
    "rules/validation.json",
    "rules/source-semantics.json",
    "rules/rule-reference-definitions.json",
    "battle/revision.json",
    "battle/primary-crosswalk.json",
    "battle/primary-missions.json",
    "battle/secondary-missions.json",
    "battle/terrain-layouts.json",
    "localization/index.json",
    "migration/migrations.json"
  ];
  requiredPaths.forEach((entryPath) => assert(entries.has(entryPath), `Missing ${entryPath}`));

  const localizationPaths = jsonEntry(entries, "localization/index.json");
  assert(Array.isArray(localizationPaths) && localizationPaths.length > 0);
  assert(localizationPaths.includes("localization/ru.json"), "Russian localization is missing");
  localizationPaths.forEach((entryPath) => assert(entries.has(entryPath), `Missing ${entryPath}`));

  const migration = jsonEntry(entries, "migration/migrations.json");
  assert.deepEqual(migration, {
    schemaVersion: 1,
    fromRevision: 916,
    toRevision: 918,
    aliases: [],
    replacements: [],
    lifecycle: [],
    tombstones: []
  });

  const sourceSemantics = jsonEntry(entries, "rules/source-semantics.json");
  assert.equal(Number(sourceSemantics.sourceDataVersion), metadata.sourceDataVersion);
  const counts = metadata.counts;
  assert.equal(jsonEntry(entries, "catalog/factions.json").length, counts.factions);
  assert.equal(jsonEntry(entries, "catalog/datasheets.json").length, counts.datasheets);
  assert.equal(jsonEntry(entries, "catalog/model-profiles.json").length, counts.modelProfiles);
  assert.equal(jsonEntry(entries, "catalog/weapons.json").length, counts.weapons);
  assert.equal(jsonEntry(entries, "catalog/abilities.json").length, counts.abilities);
  assert.equal(jsonEntry(entries, "rules/detachments.json").length, counts.detachments);
  assert.equal(jsonEntry(entries, "rules/enhancements.json").length, counts.enhancements);
  assert.equal(jsonEntry(entries, "rules/stratagems.json").length, counts.stratagems);
}

const privateKey = loadPrivateKey(process.env.RULES_DATA_ED25519_PRIVATE_KEY_BASE64);
const trustedKeys = JSON.parse(fs.readFileSync("config/trusted-keys.json", "utf8"));
const trustedKey = trustedKeys.find((candidate) => candidate.keyId === TARGET.signatureKeyId);
if (!trustedKey) throw new Error(`Trusted key is missing: ${TARGET.signatureKeyId}`);

const publicKeyDer = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
const publicKeyBase64 = publicKeyDer.subarray(publicKeyDer.length - 32).toString("base64");
assert.equal(publicKeyBase64, trustedKey.publicKeyBase64, "Signing key does not match trusted key");
assert(trustedKey.channels.includes(TARGET.channel), "Signing key is not trusted for stable channel");

const sourceArchive = fs.readFileSync(sourceArchivePath);
const sourceArchiveSha256 = sha256(sourceArchive);
const sourceEntries = readZip(sourceArchive);
const entries = new Map(sourceEntries);
const pack = jsonEntry(entries, "pack.json");

assert.equal(pack.metadata.dataRevision, 917, "Source archive is not r917");
assert.equal(pack.metadata.dataVersion, "balance-2026.08-r917", "Unexpected source data version");
assert(pack.metadata.requiredCapabilities.includes("rule-references-v1"));
assert(Array.isArray(pack.rules.ruleReferenceDefinitions));
assert(pack.rules.ruleReferenceDefinitions.length > 0);

pack.metadata = {
  ...pack.metadata,
  dataRevision: TARGET.dataRevision,
  dataVersion: TARGET.dataVersion,
  displayName: TARGET.displayName,
  publishedAt: TARGET.publishedAt,
  minAppVersionCode: TARGET.minAppVersionCode,
  requiredCapabilities: [...COMPATIBLE_CAPABILITIES]
};
pack.migration = {
  schemaVersion: 1,
  fromRevision: 916,
  toRevision: 918,
  aliases: [],
  replacements: [],
  lifecycle: [],
  tombstones: []
};

writeJsonEntry(entries, "pack.json", pack);
writeJsonEntry(entries, "metadata/pack.json", pack.metadata);
writeJsonEntry(entries, "rules/rule-reference-definitions.json", pack.rules.ruleReferenceDefinitions);
writeJsonEntry(entries, "migration/migrations.json", pack.migration);
writeJsonEntry(entries, "migration/aliases.json", []);
writeJsonEntry(entries, "migration/replacements.json", []);
writeJsonEntry(entries, "migration/retired-entities.json", []);

const allowedChangedEntries = new Set([
  "pack.json",
  "metadata/pack.json",
  "rules/rule-reference-definitions.json",
  "migration/migrations.json",
  "migration/aliases.json",
  "migration/replacements.json",
  "migration/retired-entities.json"
]);
for (const [entryPath, sourceData] of sourceEntries) {
  if (allowedChangedEntries.has(entryPath)) continue;
  assert(entries.get(entryPath).equals(sourceData), `Unexpected data change: ${entryPath}`);
}

const archive = createZip(entries);
const archiveSha256 = sha256(archive);
const signature = crypto.sign(null, Buffer.from(archiveSha256, "hex"), privateKey).toString("base64");
const manifest = {
  manifestSchemaVersion: 1,
  channel: TARGET.channel,
  sourceDataVersion: pack.metadata.sourceDataVersion,
  dataRevision: TARGET.dataRevision,
  dataVersion: TARGET.dataVersion,
  displayName: TARGET.displayName,
  publishedAt: TARGET.publishedAt,
  minAppVersionCode: TARGET.minAppVersionCode,
  requiredCapabilities: [...COMPATIBLE_CAPABILITIES],
  pack: {
    url: TARGET.packUrl,
    sizeBytes: archive.length,
    sha256: archiveSha256,
    signature,
    signatureAlgorithm: "ed25519",
    signaturePayload: "sha256",
    signatureKeyId: TARGET.signatureKeyId
  },
  notes: [...TARGET.notes]
};

assertMobileSplitContract(entries, manifest);
const rebuiltEntries = readZip(archive);
assert.equal(rebuiltEntries.size, entries.size);
assertMobileSplitContract(rebuiltEntries, manifest);

const signatureVerified = crypto.verify(
  null,
  Buffer.from(archiveSha256, "hex"),
  crypto.createPublicKey(privateKey),
  Buffer.from(signature, "base64")
);
assert(signatureVerified, "Generated signature verification failed");

const report = {
  generatorVersion: 2,
  adaptedFrom: {
    dataRevision: 917,
    dataVersion: "balance-2026.08-r917",
    archiveSha256: sourceArchiveSha256
  },
  sourceDataVersion: pack.metadata.sourceDataVersion,
  dataRevision: TARGET.dataRevision,
  dataVersion: TARGET.dataVersion,
  archive: {
    path: "noosphere-rules-pack.zip",
    sizeBytes: archive.length,
    sha256: archiveSha256,
    entryCount: entries.size
  },
  counts: pack.metadata.counts,
  requiredCapabilities: [...COMPATIBLE_CAPABILITIES],
  excludedCapabilities: ["rule-references-v1"],
  migration: { fromRevision: 916, toRevision: 918, pointOnly: true },
  russianLocalizationPreserved: true,
  unchangedArchiveEntries: [...sourceEntries.keys()].filter((entryPath) => !allowedChangedEntries.has(entryPath)).length,
  mobileCompatibility: { minAppVersionCode: 158, maxVerifiedExistingVersionCode: 161 },
  signed: true,
  signatureKeyId: TARGET.signatureKeyId,
  publicKeyBase64
};

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "noosphere-rules-pack.zip"), archive);
fs.writeFileSync(path.join(outputDirectory, "manifest.json"), canonicalJson(manifest));
fs.writeFileSync(path.join(outputDirectory, "generation-report.json"), canonicalJson(report));
process.stdout.write(canonicalJson(report));
