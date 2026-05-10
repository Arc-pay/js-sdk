import { describe, it, expect, beforeEach } from "vitest";
import { ArcPay } from "../../src/core/arcpay";

describe("sandbox banner", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    ArcPay.__resetForTests();
  });

  it("renders in test mode", async () => {
    await ArcPay.load("pk_test_x");
    const banner = document.body.querySelector("[data-arcpay-sandbox-banner]");
    expect(banner).toBeTruthy();
    expect(banner!.textContent).toMatch(/test mode/i);
  });

  it("does NOT render in live mode", async () => {
    await ArcPay.load("pk_live_x");
    expect(document.body.querySelector("[data-arcpay-sandbox-banner]")).toBeNull();
  });

  it("is dismissible", async () => {
    await ArcPay.load("pk_test_x");
    const dismiss = document.body.querySelector<HTMLButtonElement>("[data-arcpay-banner-dismiss]");
    dismiss!.click();
    expect(document.body.querySelector("[data-arcpay-sandbox-banner]")).toBeNull();
  });

  it("is idempotent (load called twice, only one banner)", async () => {
    await ArcPay.load("pk_test_x");
    await ArcPay.load("pk_test_x");
    const banners = document.body.querySelectorAll("[data-arcpay-sandbox-banner]");
    expect(banners.length).toBe(1);
  });
});
