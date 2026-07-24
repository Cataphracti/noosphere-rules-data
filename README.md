# Noosphere Rules Data

Public release channel for remotely updateable Noosphere game data.

The repository does not contain the application source code. Production data is distributed as immutable GitHub Release assets so installed builds can refresh the catalog without requiring a new APK for every data-only update.

## Stable endpoint

The application reads the latest production manifest from:

```text
https://github.com/Cataphracti/noosphere-rules-data/releases/latest/download/manifest.json
```

The manifest points to an immutable versioned ZIP asset in the same release and contains its SHA-256 checksum.

## Release assets

Every production release must contain exactly these public assets:

- `manifest.json` — small update descriptor fetched by the app;
- `noosphere-rules-pack-<release-id>.zip` — complete versioned snapshot of remote game data.

The ZIP filename and download URL are immutable after publication. Corrections are published as a new release.

## Publication pipeline

The private `Cataphracti/Noosphere` repository builds and audits the complete snapshot. It then calls the reusable publisher stored here in `.github/workflows/publish-release.yml` and passes the `RULES_DATA_PUBLISH_TOKEN` secret.

The publisher:

1. downloads the ZIP artifact created by the caller workflow;
2. calculates its byte size and SHA-256 checksum;
3. generates `manifest.json`;
4. creates a draft release in this repository;
5. uploads the ZIP first;
6. uploads `manifest.json` last;
7. downloads and validates both remote assets;
8. publishes the release only after verification succeeds.

Uploading the manifest last prevents clients from seeing a pack URL before the pack is available.

## Contract

The machine-readable manifest contract is stored in `schemas/manifest.schema.json`; operational details are in `docs/PUBLISHING.md`. A caller workflow template for the private application repository is available in `examples/noosphere-caller-workflow.yml`.
