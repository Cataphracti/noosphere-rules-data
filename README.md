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

## Publication order

1. Build the complete snapshot in the private `Cataphracti/Noosphere` repository.
2. Validate the snapshot and calculate its SHA-256 checksum.
3. Create a draft release in this repository.
4. Upload the ZIP pack.
5. Upload `manifest.json` last.
6. Verify the remote assets and checksum.
7. Publish the release and mark it as latest.

Uploading the manifest last prevents clients from seeing a pack URL before the pack is available.

## Contract

The machine-readable manifest contract is stored in `schemas/manifest.schema.json`; operational details are in `docs/PUBLISHING.md`.
