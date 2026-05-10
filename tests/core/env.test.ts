import { describe, it, expect } from "vitest";
import { detectEnvironment, validatePublishableKey } from "../../src/core/env";
import { ArcPayError } from "../../src/core/errors";

describe("env", () => {
  it("detects test mode from pk_test_ prefix", () => {
    expect(detectEnvironment("pk_test_abc123")).toBe("sandbox");
  });
  it("detects live mode from pk_live_ prefix", () => {
    expect(detectEnvironment("pk_live_xyz789")).toBe("live");
  });
  it("validatePublishableKey accepts pk_test_ and pk_live_", () => {
    expect(() => validatePublishableKey("pk_test_x")).not.toThrow();
    expect(() => validatePublishableKey("pk_live_x")).not.toThrow();
  });
  it("validatePublishableKey rejects sk_ keys (server-only)", () => {
    expect(() => validatePublishableKey("sk_test_x")).toThrowError(ArcPayError);
  });
  it("validatePublishableKey rejects empty / non-string", () => {
    expect(() => validatePublishableKey("")).toThrowError(ArcPayError);
    expect(() => validatePublishableKey(undefined as unknown as string)).toThrowError(ArcPayError);
  });
});
