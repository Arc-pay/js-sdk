# SDK releases

SDK releases are prepared in a reviewed pull request. The package version and
the runtime version constants in `src/` and `go/` must be identical before the
release is tagged.

Push the tag `go/v<MAJOR>.<MINOR>.<PATCH>` only after the reviewed release
commit is on `main`. The workflow verifies that the tag is an exact commit on
`main`, checks the committed version, runs lint, typecheck, unit tests, both
SDK bundles, bundle-size validation, and Go tests, then packs one tarball.
That tarball and its SHA-256 checksum are uploaded as assets to a draft GitHub
Release. The `sdk-npm-release` environment protects the second job: it
downloads and verifies the same assets, reconciles any existing npm version,
publishes with npm OIDC provenance, and only then publishes the GitHub Release.

If npm or GitHub returns a network or authentication error, the workflow stops
with publication state unknown. A rerun first compares the existing registry
SHA-512 integrity with the prepared asset; it never assumes that a failed
publish was harmless. A different tarball for an existing version is a hard
failure and requires a new version.

If the protected job is interrupted after npm publication, dispatch the
workflow again with the same tag. It verifies the draft assets and registry
tarball before retrying only the unfinished release step. Do not create a
second tag or manually publish the package while the state is unknown.

For a retry, dispatch from the tag itself so the workflow file and source
ref are aligned:

```sh
gh workflow run publish-npm.yml --ref go/v0.1.50 -f tag=go/v0.1.50
```

The npm trusted publisher must be configured for the `Arc-pay/js-sdk`
repository and `.github/workflows/publish-npm.yml`, with the npm package
`@thavguard/arc-pay`. It uses GitHub hosted runners and npm OIDC provenance;
no npm token or repository write token is used by the release workflow.

To validate a prepared release locally without changing files or querying npm:

```sh
node scripts/prepare-release-version.mjs --version 0.1.50
```
