import { expect, test } from "@playwright/test";

test.describe("tokenize() in real browser", () => {
  test("posts to /tokenize and returns mapped result", async ({ page }) => {
    await page.route("**/v1/payments/pay_e2e/tokenize", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          card_token_id: "tok_e2e",
          card_mask: "424242XXXXXX4242",
          card_scheme: "visa",
          card_bin: "42424242",
          expires_at: "2026-05-08T00:05:00Z",
        }),
      });
    });

    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as any).__arcpay);

    const result = await page.evaluate(async () => {
      const arcpay = (window as any).__arcpay;
      return arcpay.tokenize({
        paymentId: "pay_e2e",
        pan: "4242424242424242",
        cvv: "123",
        expiryMonth: "12",
        expiryYear: "2030",
      });
    });

    expect(result).toEqual({
      cardTokenId: "tok_e2e",
      cardMask: "424242XXXXXX4242",
      cardScheme: "visa",
      cardBin: "42424242",
      expiresAt: "2026-05-08T00:05:00Z",
    });
  });

  test("rejects bad PAN before network call (Luhn)", async ({ page }) => {
    let fetched = false;
    await page.route("**/v1/payments/**", async (route) => {
      fetched = true;
      await route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as any).__arcpay);

    const error = await page.evaluate(async () => {
      try {
        await (window as any).__arcpay.tokenize({
          paymentId: "pay_e2e",
          pan: "1111111111111111",
          cvv: "123",
          expiryMonth: "12",
          expiryYear: "2030",
        });
        return null;
      } catch (e: any) {
        return { type: e.type, message: e.message };
      }
    });

    expect(error?.type).toBe("validation_error");
    expect(error?.message).toMatch(/luhn/i);
    expect(fetched).toBe(false);
  });
});
