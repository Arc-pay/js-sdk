import { describe, it, expect, beforeEach } from "vitest";
import { ArcPay } from "../../src/core/arcpay";

describe("ArcPay.load", () => {
  beforeEach(() => ArcPay.__resetForTests());

  it("returns instance with environment populated", async () => {
    const inst = await ArcPay.load("pk_test_abc");
    expect(inst.publishableKey).toBe("pk_test_abc");
    expect(inst.environment).toBe("sandbox");
    expect("apiBase" in inst).toBe(false);
    expect("client" in inst).toBe(false);
  });

  it("is idempotent for same key", async () => {
    const a = await ArcPay.load("pk_test_abc");
    const b = await ArcPay.load("pk_test_abc");
    expect(a).toBe(b);
  });

  it("returns different instances for different keys", async () => {
    const a = await ArcPay.load("pk_test_aaa");
    const b = await ArcPay.load("pk_test_bbb");
    expect(a).not.toBe(b);
  });

  it("throws on invalid key (sk_*)", async () => {
    await expect(ArcPay.load("sk_test_x")).rejects.toThrow(/publishable key/i);
  });
});
