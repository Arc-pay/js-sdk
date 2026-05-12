import { expect, test } from "@playwright/test";

test.describe("Hosted Fields", () => {
  test("mounts fields and tokenizes through iframe postMessage API", async ({ page }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as any).__arcpay);

    const result = await page.evaluate(async () => {
      const arcpay = (window as any).__arcpay;
      const root = document.createElement("div");
      root.innerHTML = `
        <div id="card-number" style="height: 32px"></div>
        <div id="card-expiry" style="height: 32px"></div>
        <div id="card-cvv" style="height: 32px"></div>
      `;
      document.body.appendChild(root);

      const elements = arcpay.elements({ iframeBase: window.location.origin });
      const fields = [
        elements.create("cardNumber"),
        elements.create("cardExpiry"),
        elements.create("cardCvv"),
      ];
      const ready = Promise.all(
        fields.map(
          (field) =>
            new Promise<void>((resolve, reject) => {
              field.on("ready", resolve);
              field.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
            }),
        ),
      );

      fields[0].mount("#card-number");
      fields[1].mount("#card-expiry");
      fields[2].mount("#card-cvv");
      await ready;

      return elements.tokenize("pay_hosted_fields", "idem-hosted-fields");
    });

    expect(result).toEqual({
      cardTokenId: "tok_hosted_fields",
      cardMask: "424242XXXXXX4242",
      cardScheme: "visa",
      cardBin: "42424242",
      expiresAt: "2026-05-12T12:00:00Z",
    });
  });
});
