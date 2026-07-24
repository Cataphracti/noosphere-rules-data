# Noosphere Rules Data

Public distribution channel for remotely updateable Noosphere game data.

This repository contains no application source code. It serves immutable, signed full-snapshot data packs through GitHub Releases so ordinary rule-data updates do not require a new APK.

## Stable manifest endpoint

```text
https://github.com/Cataphracti/noosphere-rules-data/releases/latest/download/manifest.json
```

## Release assets

Each published release contains:

- `manifest.json` — signed update descriptor consumed by the app;
- `noosphere-rules-pack.zip` — complete immutable data snapshot;
- `generation-report.json` — generator metadata and audit counts.

Release tags use:

```text
rules-data-<dataVersion>
```

The archive filename is stable, but its URL is immutable because every release has a unique tag. Existing releases and assets must never be replaced.

## Security

The app and this repository validate:

- manifest schema and release URL consistency;
- channel and monotonically increasing data revision;
- exact archive size;
- SHA-256 checksum;
- Ed25519 signature over the raw SHA-256 digest;
- trusted key/channel mapping.

Trusted public verification keys are stored in `config/trusted-keys.json`. Private signing keys remain only in GitHub Actions Secrets in the private `Cataphracti/Noosphere` repository.

## Publication pipeline

The authoritative publisher is `.github/workflows/publish-rules-data-pack.yml` in the private application repository. It builds and signs the pack, creates a draft release here, uploads the archive first, verifies the remote archive, uploads `manifest.json` last, publishes the release as Latest, and validates the public endpoint.

Every published release also triggers `.github/workflows/validate-release.yml` in this repository for an independent SHA-256 and Ed25519 verification.

See `docs/PUBLISHING.md` and `schemas/manifest.schema.json` for the public contract.
