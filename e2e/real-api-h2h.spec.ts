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
  acs_url?: string;
  c_req?: string;
  pa_req?: string;
  md?: string;
  three_ds_method_url?: string;
  three_ds_method_data?: string;
  three_ds_server_trans_id?: string;
}

interface SberCardVector {
  pan: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
  amount: number;
  scheme: string;
  acsCode?: string;
}

const cardForProject = (projectName: string): SberCardVector => {
  switch (projectName) {
    case "firefox":
      return {
        pan: "2202205300068092",
        cvv: "583",
        expiryMonth: "05",
        expiryYear: "2026",
        amount: 5000,
        scheme: "mir",
        acsCode: "111111",
      };
    case "webkit":
      return {
        pan: "5469980100048525",
        cvv: "041",
        expiryMonth: "05",
        expiryYear: "2026",
        amount: 25000,
        scheme: "mc",
        acsCode: "111111",
      };
    default:
      return {
        pan: "2202205000012424",
        cvv: "669",
        expiryMonth: "05",
        expiryYear: "2035",
        amount: 25000,
        scheme: "mir",
      };
  }
};

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

        const timer = window.setTimeout(() => cleanup("U"), 10_000);
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

const parseFormBody = (body: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    result[key] = value;
  }
  return result;
};

const complete3DSChallengeInBrowser = async (
  page: Page,
  paymentId: string,
  executed: ExecutePaymentResponse,
  acsCode: string,
): Promise<ExecutePaymentResponse> => {
  if (!executed.acs_url || (!executed.c_req && !executed.pa_req)) {
    return executed;
  }

  const termUrl = `${apiBase}/v1/3ds-callback?payment_id=${encodeURIComponent(paymentId)}&env=sandbox`;
  let callbackPayload: Record<string, string> | undefined;

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const form = parseFormBody(request.postData() || "");
      if (form.CRes || form.cres || form.cRes || form.PaRes || form.paRes || request.url().startsWith(termUrl)) {
        callbackPayload = form;
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>3DS captured</title>3DS captured",
        });
        return;
      }
    }
    await route.continue();
  });

  const fields = executed.c_req
    ? `<input type="hidden" name="creq" value="${executed.c_req}">`
    : [
        `<input type="hidden" name="PaReq" value="${executed.pa_req || ""}">`,
        `<input type="hidden" name="MD" value="${executed.md || ""}">`,
        `<input type="hidden" name="TermUrl" value="${termUrl}">`,
      ].join("");

  await page.setContent(
    `<!doctype html>
     <form id="threeDS" method="POST" action="${executed.acs_url}">${fields}</form>
     <script>document.getElementById("threeDS").submit()</script>`,
    { waitUntil: "domcontentloaded" },
  );

  const passwordSelector =
    'input[name="password"], input#password, input[name="otp"], input[name="code"], input[type="password"]';
  const input = page.locator(passwordSelector).first();
  await input.waitFor({ timeout: 30_000 });
  await input.fill("").catch(() => {});
  await input.pressSequentially(acsCode, { delay: 25 });

  const submit = page
    .locator(
      [
        'input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Подтвердить")',
        'button:has-text("Продолжить")',
        'button:has-text("Отправить")',
        'button:has-text("Submit")',
        'button:has-text("Confirm")',
        'input[type="button"][value*="Submit" i]',
        'input[type="button"][value*="Confirm" i]',
        'input[type="button"][value*="Отправ" i]',
      ].join(", "),
    )
    .first();
  if (await submit.count()) {
    await submit.click().catch(() => {});
  } else {
    await input.press("Enter").catch(() => {});
  }

  const deadline = Date.now() + 30_000;
  while (!callbackPayload && Date.now() < deadline) {
    await page.waitForTimeout(250);
  }
  await page.unroute("**/*");
  expect(callbackPayload, "ACS callback payload").toBeTruthy();

  const callbackBody = new URLSearchParams();
  const cRes = callbackPayload?.CRes || callbackPayload?.cres || callbackPayload?.cRes || "";
  const paRes = callbackPayload?.PaRes || callbackPayload?.paRes || "";
  if (cRes) callbackBody.set("cres", cRes);
  if (paRes) callbackBody.set("PaRes", paRes);
  callbackBody.set("MD", callbackPayload?.MD || callbackPayload?.md || executed.md || "");

  const callbackResp = await fetch(termUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: callbackBody,
    redirect: "manual",
  });
  expect([302, 303]).toContain(callbackResp.status);

  const paymentResp = await fetch(`${apiBase}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!paymentResp.ok) {
    throw new Error(await paymentResp.text());
  }
  const payment = (await paymentResp.json()) as { payment_id?: string; id?: string; status: string };
  return { ...executed, payment_id: payment.payment_id || payment.id || paymentId, status: payment.status };
};

test("real API H2H: JS SDK tokenizes in browser, API executes payment", async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const card = cardForProject(testInfo.project.name);
  const idem = uniqueKey("sdk-h2h-create");
  const createResp = await fetch(`${apiBase}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idem,
    },
    body: JSON.stringify({
      amount: card.amount,
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
    async ({ apiBase: browserApiBase, publishableKey: pk, paymentId, pan, cvv, expiryMonth, expiryYear }) => {
      (window as any).ArcPay.ArcPay.__resetForTests();
      const arcpay = await (window as any).ArcPay.ArcPay.load(pk, { apiBase: browserApiBase });
      return arcpay.tokenize({
        paymentId,
        pan,
        cvv,
        expiryMonth,
        expiryYear,
      });
    },
    { apiBase, publishableKey, paymentId: created.id, ...card },
  );
  expect(tokenized.cardTokenId).toBeTruthy();
  expect(tokenized.cardScheme.toLowerCase()).toBe(card.scheme);

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
  executed = await complete3DSChallengeInBrowser(page, created.id, executed, card.acsCode || "111111");
  expect(executed.payment_id).toBe(created.id);
  expect(["captured", "authorized"]).toContain(executed.status);
});
