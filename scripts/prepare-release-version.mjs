#!/usr/bin/env node
import { readFileSync } from "node:fs";

const packagePath = new URL("../package.json", import.meta.url);
const goModulePath = new URL("../go/go.mod", import.meta.url);
const runtimeFiles = [
  [new URL("../src/index.ts", import.meta.url), "SDK_VERSION"],
  [new URL("../src/react/index.ts", import.meta.url), "REACT_WRAPPER_VERSION"],
  [new URL("../src/server/client.ts", import.meta.url), "SERVER_SDK_VERSION"],
  [new URL("../go/client.go", import.meta.url), "goSDKVersion"],
];

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported stable semver version: ${version}`);
  }
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function readRuntimeVersion(fileUrl, exportName) {
  const source = readFileSync(fileUrl, "utf8");
  const pattern = new RegExp(`(export\\s+)?(?:const\\s+)?${exportName}(\\s*=\\s*)"([^"]+)";?`);
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Could not find ${exportName} in ${fileUrl.pathname}`);
  }
  return match[3];
}

const versionFlag = process.argv.indexOf("--version");
const expectedVersion = versionFlag >= 0 ? process.argv[versionFlag + 1] : undefined;
if (
  !expectedVersion ||
  versionFlag + 2 < process.argv.length ||
  process.argv.filter((argument) => argument === "--version").length !== 1
) {
  throw new Error("Usage: prepare-release-version.mjs --version X.Y.Z");
}
parseVersion(expectedVersion);

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const versions = [["package.json", pkg.version]];
for (const [fileUrl, exportName] of runtimeFiles) {
  versions.push([fileUrl.pathname, readRuntimeVersion(fileUrl, exportName)]);
}
for (const [file, version] of versions) {
  parseVersion(version);
  if (version !== expectedVersion) {
    throw new Error(`${file} has ${version}; expected ${expectedVersion}`);
  }
}

const goModule = readFileSync(goModulePath, "utf8");
if (!/^module github\.com\/Arc-pay\/js-sdk\/go$/m.test(goModule)) {
  throw new Error("Go SDK module path must remain github.com/Arc-pay/js-sdk/go");
}

console.log(expectedVersion);
