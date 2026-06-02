#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const packagePath = new URL("../package.json", import.meta.url);
const sdkIndexPath = new URL("../src/index.ts", import.meta.url);
const reactIndexPath = new URL("../src/react/index.ts", import.meta.url);
const serverClientPath = new URL("../src/server/client.ts", import.meta.url);
const goClientPath = new URL("../go/client.go", import.meta.url);

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

function latestPublishedVersion(packageName) {
  try {
    return execFileSync("npm", ["view", packageName, "version", "--silent"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function updateRuntimeVersion(fileUrl, exportName, nextVersion) {
  const source = readFileSync(fileUrl, "utf8");
  const pattern = new RegExp(`(export\\s+)?const ${exportName} = "[^"]+";`);
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${exportName} in ${fileUrl.pathname}`);
  }
  const nextSource = source.replace(pattern, (match, exportPrefix = "") => {
    return `${exportPrefix}const ${exportName} = "${nextVersion}";`;
  });
  writeFileSync(fileUrl, nextSource);
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const publishedVersion = latestPublishedVersion(pkg.name);
const nextVersion =
  publishedVersion && compareVersions(pkg.version, publishedVersion) <= 0
    ? bumpPatch(publishedVersion)
    : pkg.version;

pkg.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
updateRuntimeVersion(sdkIndexPath, "SDK_VERSION", nextVersion);
updateRuntimeVersion(reactIndexPath, "REACT_WRAPPER_VERSION", nextVersion);
updateRuntimeVersion(serverClientPath, "SERVER_SDK_VERSION", nextVersion);
updateRuntimeVersion(goClientPath, "goSDKVersion", nextVersion);

console.log(nextVersion);
