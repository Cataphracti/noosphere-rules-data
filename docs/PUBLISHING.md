# Publishing Noosphere rules data

## Source of truth

The private `Cataphracti/Noosphere` repository owns the runtime source, deterministic pack generator, Ed25519 signing key secret, migrations and release workflow.

This public repository is the delivery endpoint only:

```text
https://github.com/Cataphracti/noosphere-rules-data/releases/latest/download/manifest.json
```

## Required private-repository configuration

The private repository must contain:

```text
RULES_DATA_PUBLISH_TOKEN
RULES_DATA_ED25519_PRIVATE_KEY_BASE64
RULES_DATA_PUBLISH_REPOSITORY=Cataphracti/noosphere-rules-data
```

`RULES_DATA_PUBLISH_TOKEN` is a fine-grained personal access token restricted to this repository with **Contents: Read and write**. The private signing key is a base64-encoded PKCS#8 Ed25519 key and is never committed.

The private repository includes `scripts/setup-rules-data-github.ps1`, which performs all automatable setup and rotates the embedded production public key.

## Release naming and assets

Tag:

```text
rules-data-<dataVersion>
```

Required release assets:

```text
noosphere-rules-pack.zip
manifest.json
generation-report.json
```

The immutable archive URL stored in the manifest is:

```text
https://github.com/Cataphracti/noosphere-rules-data/releases/download/rules-data-<dataVersion>/noosphere-rules-pack.zip
```

Never reuse a tag, overwrite an asset or edit an already published pack. A correction uses a higher `dataRevision`, a new `dataVersion` and a new release.

## Manifest contract

`manifest.json` follows `schemas/manifest.schema.json` and includes:

- `manifestSchemaVersion`;
- channel: `stable`, `beta` or `internal`;
- monotonically increasing `dataRevision`;
- immutable `dataVersion`;
- user-facing display name and publication time;
- minimum compatible Android `versionCode`;
- required runtime capabilities;
- archive URL, exact byte size and SHA-256;
- Ed25519 signature, payload type and trusted key ID;
- release notes.

## Publication order

The private publisher workflow:

1. runs the complete rules-data regression suite;
2. builds one deterministic full snapshot;
3. signs the raw SHA-256 digest with Ed25519;
4. validates the generated archive and manifest;
5. refuses an existing release tag;
6. creates a draft release in this repository;
7. uploads `noosphere-rules-pack.zip` and `generation-report.json` first;
8. downloads the archive again and verifies SHA-256;
9. uploads `manifest.json` last;
10. publishes the release as Latest;
11. verifies the public endpoint again.

Uploading the manifest last prevents clients from observing a pack URL before the archive is available.

## Independent validation

Every published release triggers `.github/workflows/validate-release.yml` in this repository. It downloads `manifest.json` and `noosphere-rules-pack.zip`, then verifies:

- required manifest fields and channel;
- tag/dataVersion/URL consistency;
- trusted key and allowed channel;
- exact archive size;
- exact SHA-256;
- Ed25519 signature over the raw SHA-256 digest.

Trusted public keys are mirrored in `config/trusted-keys.json`. When the production key is rotated in the private application branch, this public copy must be updated before the first release signed by the new key.

## Failure behaviour

- A failed build or audit must not create a public manifest.
- A failed upload or post-upload verification leaves the release as draft.
- Published assets are immutable.
- The application retains the previously active pack and bundled fallback when download, signature, schema, migration or activation fails.
