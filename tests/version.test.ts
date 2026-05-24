import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "../src/index";
import { REACT_WRAPPER_VERSION } from "../src/react/index";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as { version: string };

describe("published runtime versions", () => {
  it("match package.json", () => {
    expect(SDK_VERSION).toBe(pkg.version);
    expect(REACT_WRAPPER_VERSION).toBe(pkg.version);
  });
});
