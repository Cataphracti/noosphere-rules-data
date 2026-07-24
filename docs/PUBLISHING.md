# Publishing Noosphere rules data

## Purpose

`Cataphracti/noosphere-rules-data` is the public delivery repository. The private `Cataphracti/Noosphere` repository remains the source of truth and must build the complete data snapshot.

The installed application should eventually use this stable endpoint:

```text
https://github.com/Cataphracti/noosphere-rules-data/releases/latest/download/manifest.json
```

The currently shipped endpoint `https://data.noosphere.app/manifest.json` is compiled into the APK through Expo environment configuration. Existing installations therefore require one transition APK before GitHub Releases can become the production update channel.

## Required publisher secret

Create a fine-grained GitHub personal access token that can write repository contents for **only** `Cataphracti/noosphere-rules-data`, then add it to the private `Cataphracti/Noosphere` repository as this Actions secret:

```text
RULES_DATA_PUBLISH_TOKEN
```

Recommended minimum token access:

- Repository access: only `Cataphracti/noosphere-rules-data`;
- Repository permissions → Contents: Read and write;
- Metadata: Read-only (automatic).

No publishing token must be stored in the public data repository or committed to either repository.

An optional Actions variable can be introduced later if the target repository becomes configurable:

```text
RULES_DATA_PUBLISH_REPOSITORY=Cataphracti/noosphere-rules-data
```

For the first implementation, keeping the repository name explicit in the workflow is safer and easier to audit.

## Release naming

Use tags with this format:

```text
rules-v<release-id>
```

Example:

```text
rules-v2026.07.24.1
```

The ZIP must use the same release identifier:

```text
noosphere-rules-pack-2026.07.24.1.zip
```

Never replace an already published ZIP or reuse a release tag. Publish a new release identifier for every correction.

## Required manifest fields

A production manifest must follow `schemas/manifest.schema.json` and contain:

- manifest schema version;
- channel (`production` or `beta`);
- release identifier and tag;
- publication timestamp;
- minimum compatible app version and Android build number;
- remote data schema version;
- immutable ZIP filename and URL;
- ZIP byte size;
- lowercase SHA-256 digest;
- optional Ed25519 signature block when signing is enabled.

## Publisher workflow contract

The publishing workflow belongs in the private `Cataphracti/Noosphere` repository because that repository contains the source data and release checks.

The workflow must:

1. Check out an explicit commit from `main` or an approved release branch.
2. Run the existing public release gate and remote-data-specific validation.
3. Build one complete snapshot pack; incremental patches are not used for v1.
4. Produce a deterministic ZIP with the complete remotely replaceable dataset.
5. Calculate byte size and SHA-256 from the exact ZIP that will be uploaded.
6. Generate `manifest.json` from those calculated values.
7. Create a draft GitHub Release in `Cataphracti/noosphere-rules-data`.
8. Upload the ZIP first.
9. Upload `manifest.json` last.
10. Download both assets again and verify filename, size and SHA-256.
11. Publish the draft release and mark it as the latest release.

Use `RULES_DATA_PUBLISH_TOKEN` only for the cross-repository release operations. Normal checks in the private application repository should continue to use its built-in `GITHUB_TOKEN`.

## Failure behaviour

- A failed build or audit must not create a public manifest.
- A failed upload must leave the release as draft.
- A failed post-upload verification must leave the release as draft and fail the workflow.
- Published release assets are immutable by policy.
- The application must keep its bundled or previously activated pack when manifest download, ZIP download, checksum verification, schema validation or activation fails.

## Validation in this repository

Every published release triggers `.github/workflows/validate-release.yml`. The workflow downloads `manifest.json` and the versioned ZIP, then verifies:

- required manifest fields;
- tag, filename and immutable URL consistency;
- exact byte size;
- exact SHA-256 checksum.

The workflow can also be started manually for an existing release tag.
