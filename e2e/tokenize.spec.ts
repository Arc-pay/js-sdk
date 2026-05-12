import { expect, test } from "@playwright/test";

test.describe("raw tokenize API exposure", () => {
  test("does not expose raw PAN/CVV tokenization on ArcPay instance", async ({ page }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as any).__arcpay);

    const hasRawTokenize = await page.evaluate(() => {
      const arcpay = (window as any).__arcpay;
      return typeof arcpay.tokenize === "function" || typeof arcpay.client?.post === "function";
    });

    expect(hasRawTokenize).toBe(false);
  });
});
