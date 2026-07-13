import { expect, test } from "@playwright/test";
import type { ArcPayInstance } from "../src";

type ArcPayTestWindow = Window & { __arcpay?: ArcPayInstance };

test.describe("raw tokenize API exposure", () => {
  test("does not expose raw PAN/CVV tokenization on ArcPay instance", async ({ page }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as ArcPayTestWindow).__arcpay);

    const hasRawTokenize = await page.evaluate(() => {
      const arcpay = (window as ArcPayTestWindow).__arcpay;
      if (!arcpay) throw new Error("ArcPay fixture was not initialized");
      return typeof arcpay.tokenize === "function" || typeof arcpay.client?.post === "function";
    });

    expect(hasRawTokenize).toBe(false);
  });
});
