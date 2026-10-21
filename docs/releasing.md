# SDK releases

SDK releases are prepared in a reviewed pull request. The package version and
the runtime version constants in `src/` and `go/` must be identical before the
release is tagged.

Create a GitHub Release from the reviewed `main` commit with the tag
`go/v<MAJOR>.<MINOR>.<PATCH>`. Publishing runs only for a published GitHub
Release, checks that the tag points to `main`, verifies the committed version,
builds and tests the SDK, and publishes the exact tarball produced by that
build. The `sdk-npm-release` environment protects the final npm publication.

The npm trusted publisher must be configured for the `Arc-pay/js-sdk`
repository and `.github/workflows/publish-npm.yml`, with the npm package
`@thavguard/arc-pay`. It uses GitHub hosted runners and npm OIDC provenance;
no npm token or repository write token is used by the release workflow.

To validate a prepared release locally without changing files or querying npm:

```sh
node scripts/prepare-release-version.mjs --version 0.1.50
```
