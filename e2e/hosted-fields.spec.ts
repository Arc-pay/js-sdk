import { expect, test } from "@playwright/test";
import type { ArcPayInstance } from "../src";

type ArcPayTestWindow = Window & {
  __arcpay?: ArcPayInstance;
  __lastArcPayStyle?: unknown;
};

test.describe("Hosted Fields", () => {
  test("mounts the secure card field and tokenizes through iframe postMessage API", async ({
    page,
  }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as ArcPayTestWindow).__arcpay);

    const result = await page.evaluate(async () => {
      const arcpay = (window as ArcPayTestWindow).__arcpay;
      if (!arcpay) throw new Error("ArcPay fixture was not initialized");
      const root = document.createElement("div");
      root.innerHTML = `
        <div id="card" style="height: 44px"></div>
      `;
      document.body.appendChild(root);

      const elements = arcpay.elements({ iframeBase: window.location.origin });
      const field = elements.create("card");
      const ready = new Promise<void>((resolve, reject) => {
        field.on("ready", resolve);
        field.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
      });

      field.mount("#card");
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
    await page.waitForFunction(() => (window as ArcPayTestWindow).__arcpay);

    await page.evaluate(async () => {
      const arcpay = (window as ArcPayTestWindow).__arcpay;
      if (!arcpay) throw new Error("ArcPay fixture was not initialized");
      const root = document.createElement("div");
      root.innerHTML = `<div id="card" style="height: 44px"></div>`;
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
              border: "0",
              "box-sizing": "border-box",
              padding: "10px 12px",
              "font-weight": "600",
            },
            focus: {
              color: "rgb(14, 116, 144)",
            },
          },
        },
      });
      const field = elements.create("card");
      await new Promise<void>((resolve, reject) => {
        field.on("ready", resolve);
        field.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
        field.mount("#card");
      });
    });

    const iframe = await page.locator("#card iframe").elementHandle();
    const frame = await iframe?.contentFrame();
    if (!frame) throw new Error("card iframe was not mounted");

    const style = await frame.waitForFunction(() => (window as ArcPayTestWindow).__lastArcPayStyle);

    expect(await style.jsonValue()).toEqual({
      base: {
        color: "rgb(15, 23, 42)",
        "--arcpay-placeholder-color": "rgb(100, 116, 139)",
        "caret-color": "rgb(15, 23, 42)",
        border: "0",
        "box-sizing": "border-box",
        "font-weight": "600",
        padding: "10px 12px",
      },
      focus: {
        color: "rgb(14, 116, 144)",
      },
    });
  });

  test("mounts split secure card fields and tokenizes through cardNumber coordinator", async ({
    page,
  }) => {
    await page.goto("/merchant.html");
    await page.waitForFunction(() => (window as ArcPayTestWindow).__arcpay);

    const result = await page.evaluate(async () => {
      const arcpay = (window as ArcPayTestWindow).__arcpay;
      if (!arcpay) throw new Error("ArcPay fixture was not initialized");
      const root = document.createElement("div");
      root.innerHTML = `
        <div id="card-number" style="height: 44px"></div>
        <div id="card-expiry" style="height: 44px"></div>
        <div id="card-cvv" style="height: 44px"></div>
      `;
      document.body.appendChild(root);

      const elements = arcpay.elements({ iframeBase: window.location.origin });
      const cardNumber = elements.create("cardNumber");
      const cardExpiry = elements.create("cardExpiry");
      const cardCvv = elements.create("cardCvv");
      const ready = Promise.all([
        new Promise<void>((resolve, reject) => {
          cardNumber.on("ready", resolve);
          cardNumber.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
        }),
        new Promise<void>((resolve, reject) => {
          cardExpiry.on("ready", resolve);
          cardExpiry.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
        }),
        new Promise<void>((resolve, reject) => {
          cardCvv.on("ready", resolve);
          cardCvv.on("error", (event: { reason: string }) => reject(new Error(event.reason)));
        }),
      ]);

      cardNumber.mount("#card-number");
      cardExpiry.mount("#card-expiry");
      cardCvv.mount("#card-cvv");
      await ready;

      return elements.tokenize("pay_split_hosted_fields", "idem-split-hosted-fields");
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
});
