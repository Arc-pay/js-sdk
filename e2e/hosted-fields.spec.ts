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
      expiresIn: 900,
      expiresAt: "2026-05-12T12:00:00Z",
    });
  });

  test("sends only iframe-safe appearance styles to hosted fields", async ({ page }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as any).__arcpay);

    await page.evaluate(async () => {
      const arcpay = (window as any).__arcpay;
      const root = document.createElement("div");
      root.innerHTML = `<div id="card-number" style="height: 32px"></div>`;
      document.body.appendChild(root);

      const elements = arcpay.elements({
        iframeBase: window.location.origin,
        appearance: {
          variables: {
            colorText: "rgb(15, 23, 42)",
            colorPlaceholder: "rgb(100, 116, 139)",
            caretColor: "rgb(15, 23, 42)",
          },
          rules: {
            base: {
              border: "10px solid red",
              padding: "24px",
              "font-weight": "600",
            },
            focus: {
              color: "rgb(14, 116, 144)",
            },
          },
        },
      });
      const field = elements.create("cardNumber");
      await new Promise<void>((resolve, reject) => {
        field.on("ready", resolve);
        field.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
        field.mount("#card-number");
      });
    });

    const iframe = await page.locator("#card-number iframe").elementHandle();
    const frame = await iframe?.contentFrame();
    if (!frame) throw new Error("cardNumber iframe was not mounted");

    const style = await frame.waitForFunction(() => (window as any).__lastArcPayStyle);

    expect(await style.jsonValue()).toEqual({
      base: {
        color: "rgb(15, 23, 42)",
        "--arcpay-placeholder-color": "rgb(100, 116, 139)",
        "caret-color": "rgb(15, 23, 42)",
        "font-weight": "600",
      },
      focus: {
        color: "rgb(14, 116, 144)",
      },
    });
  });
});
