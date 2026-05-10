import { expect, test, type Page } from "@playwright/test";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const apiBase = requiredEnv("ARC_PAY_E2E_API_BASE");
const secretKey = requiredEnv("ARC_PAY_E2E_SECRET_KEY");
const publishableKey = requiredEnv("ARC_PAY_E2E_PUBLISHABLE_KEY");

const uniqueKey = (prefix: string) =>
  `${prefix.slice(0, 3)}-${crypto.randomUUID()}`;

interface ExecutePaymentResponse {
  payment_id: string;
  status: string;
  three_ds_method_url?: string;
  three_ds_method_data?: string;
  three_ds_server_trans_id?: string;
}

const completeThreeDSMethodInBrowser = async (
  page: Page,
  methodUrl: string,
  methodData: string,
): Promise<"Y" | "U"> =>
  page.evaluate(
    ({ methodUrl: url, methodData: data }) =>
      new Promise<"Y" | "U">((resolve) => {
        const iframe = document.createElement("iframe");
        iframe.name = `arcpay-three-ds-method-${crypto.randomUUID()}`;
        iframe.title = "ArcPay 3DS Method";
        iframe.hidden = true;
        iframe.setAttribute("sandbox", "allow-forms allow-scripts");

        const form = document.createElement("form");
        form.method = "POST";
        form.action = url;
        form.target = iframe.name;
        form.hidden = true;

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "threeDSMethodData";
        input.value = data;
        form.append(input);

        let submitted = false;
        let settled = false;

        const cleanup = (indicator: "Y" | "U") => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          iframe.remove();
          form.remove();
          resolve(indicator);
        };

        const timer = window.setTimeout(() => cleanup("U"), 30_000);
        iframe.addEventListener("load", () => {
          if (submitted) cleanup("Y");
        });

        document.body.append(iframe, form);
        submitted = true;
        form.submit();
      }),
    { methodUrl, methodData },
  );

const completeThreeDSMethodIfNeeded = async (
  page: Page,
  paymentId: string,
  executed: ExecutePaymentResponse,
): Promise<ExecutePaymentResponse> => {
  if (!executed.three_ds_method_url && !executed.three_ds_method_data) {
    return executed;
  }
  expect(executed.three_ds_server_trans_id).toBeTruthy();

  const completionIndicator = await completeThreeDSMethodInBrowser(
    page,
    executed.three_ds_method_url,
    executed.three_ds_method_data,
  );

  const completeResp = await fetch(`${apiBase}/v1/payments/${paymentId}/complete-3ds-method`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": uniqueKey("sdk-h2h-method-header"),
    },
    body: JSON.stringify({
      completion_indicator: completionIndicator,
      three_ds_server_trans_id: executed.three_ds_server_trans_id,
    }),
  });
  if (!completeResp.ok) {
    throw new Error(await completeResp.text());
  }
  return completeResp.json() as Promise<ExecutePaymentResponse>;
};

test("real API H2H: JS SDK tokenizes in browser, API executes payment", async ({ page }) => {
  const idem = uniqueKey("sdk-h2h-create");
  const createResp = await fetch(`${apiBase}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idem,
    },
    body: JSON.stringify({
      amount: 25000,
      currency: "RUB",
      payment_method: "card",
      auto_capture: true,
      external_id: idem,
      success_url: "https://merchant.test/ok",
      fail_url: "https://merchant.test/fail",
      callback_url: "https://merchant.test/webhook",
      description: "E2E JS SDK H2H payment",
    }),
  });
  if (!createResp.ok) {
    throw new Error(await createResp.text());
  }
  const created = await createResp.json();
  expect(created.id).toBeTruthy();

  await page.goto("/merchant.html");
  await page.waitForFunction(() => (window as any).ArcPay?.ArcPay);
  const tokenized = await page.evaluate(
    async ({ apiBase: browserApiBase, publishableKey: pk, paymentId }) => {
      (window as any).ArcPay.ArcPay.__resetForTests();
      const arcpay = await (window as any).ArcPay.ArcPay.load(pk, { apiBase: browserApiBase });
      return arcpay.tokenize({
        paymentId,
        pan: "2202205000012424",
        cvv: "669",
        expiryMonth: "05",
        expiryYear: "2035",
      });
    },
    { apiBase, publishableKey, paymentId: created.id },
  );
  expect(tokenized.cardTokenId).toBeTruthy();
  expect(tokenized.cardScheme.toLowerCase()).toBe("mir");

  const executeResp = await fetch(`${apiBase}/v1/payments/${created.id}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": uniqueKey("sdk-h2h-execute-header"),
    },
    body: JSON.stringify({
      card_token_id: tokenized.cardTokenId,
      idempotency_key: crypto.randomUUID(),
      browser_info: {
        language: "ru-RU",
        screen_width: 1280,
        screen_height: 720,
        color_depth: 24,
        timezone_offset_minutes: -180,
        java_enabled: false,
        user_agent: "Playwright ArcPay SDK E2E",
      },
    }),
  });
  if (!executeResp.ok) {
    throw new Error(await executeResp.text());
  }
  let executed = (await executeResp.json()) as ExecutePaymentResponse;
  executed = await completeThreeDSMethodIfNeeded(page, created.id, executed);
  expect(executed.payment_id).toBe(created.id);
  expect(["captured", "authorized"]).toContain(executed.status);
});
