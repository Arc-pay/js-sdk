import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createArcPayClient } from "../../src/server";
import type { ArcPayClient, RequestOptions } from "../../src/server/client";

const IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a36";
const API = "https://dev-api.arcpay.space/v1";

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Loose = Record<string, (...args: unknown[]) => Promise<unknown>>;

describe("server ArcPayClient subscriptions and cards", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: ArcPayClient;
  let windowDescriptor: PropertyDescriptor | undefined;
  let documentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    fetchMock = vi.fn().mockImplementation(async () => ok({ id: "sub_1" }));
    client = createArcPayClient({
      secretKey: "sk_test_fixture",
      apiBase: API,
      fetch: fetchMock as unknown as typeof fetch,
      retryDelayMs: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (documentDescriptor) {
      Object.defineProperty(globalThis, "document", documentDescriptor);
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call]!;
    return {
      url: String(url),
      method: init.method as string,
      headers: init.headers as Record<string, string>,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
  };

  it("creates a direct subscription with idempotency, retry schedule and receipt items", async () => {
    const body = {
      customer_id: "cust_1",
      customer_email: "buyer@example.test",
      amount: 10000,
      currency: "RUB",
      billing_interval_type: "month" as const,
      billing_interval_count: 1,
      billing_trial_days: 7,
      billing_trial_price: 0,
      payment_method: "bank_card" as const,
      card_token_id: "11111111-1111-7111-8111-111111111111",
      external_id: "plan-1",
      retry_schedule: [2, 3],
      items: [{ name: "Plan", quantity: "1", unit_price: 10000, vat_rate: 22 }],
      trial_items: [{ name: "Trial", unit_price: 0 }],
    };

    await client.createSubscription(body, { idempotencyKey: IDEMPOTENCY_KEY });

    expect(sent()).toMatchObject({ url: `${API}/subscriptions-v2`, method: "POST" });
    expect(sent().headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
    expect(sent().body).toEqual(body);
  });

  it("creates a link subscription without adding money or receipt fields", async () => {
    const body = {
      link_id: "22222222-2222-7222-8222-222222222222",
      customer_id: "cust_1",
      payment_method: "sbp" as const,
    };

    await client.createSubscription(body, { idempotencyKey: IDEMPOTENCY_KEY });

    expect(sent().body).toEqual(body);
  });

  it.each([
    ["amount", { amount: 0 }],
    ["amount", { amount: 100.5 }],
    ["billing_trial_price", { billing_trial_price: -1 }],
    ["items.0.unit_price", { items: [{ unit_price: 1.5 }] }],
    ["trial_items.0.unit_price", { trial_items: [{ unit_price: -1 }] }],
  ])("rejects an invalid subscription %s before sending", async (param, fields) => {
    await expect(
      client.createSubscription(
        { customer_id: "cust_1", payment_method: "bank_card", ...fields },
        { idempotencyKey: IDEMPOTENCY_KEY },
      ),
    ).rejects.toMatchObject({ type: "validation_error", code: "invalid_amount", param });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires an idempotency key to create or retry a subscription", async () => {
    await expect(
      client.createSubscription(
        { customer_id: "cust_1", payment_method: "bank_card" },
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: "missing_idempotency_key" });
    await expect(client.retrySubscriptionBilling("sub_1", {} as never)).rejects.toMatchObject({
      code: "missing_idempotency_key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets a subscription by encoded id", async () => {
    await client.getSubscription("sub/1");

    expect(sent()).toMatchObject({ url: `${API}/subscriptions-v2/sub%2F1`, method: "GET" });
    expect(sent().body).toBeUndefined();
  });

  it("lists subscriptions filtered by external_id", async () => {
    await client.listSubscriptions({
      external_id: "plan 1&a",
      status: "active",
      link_id: "link_1",
      limit: 20,
      cursor: "opaque+cursor",
    });

    const url = new URL(sent().url);
    expect(url.pathname).toBe("/v1/subscriptions-v2");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      external_id: "plan 1&a",
      status: "active",
      link_id: "link_1",
      limit: "20",
      cursor: "opaque+cursor",
    });
  });

  it("lists subscriptions without a query", async () => {
    await client.listSubscriptions();

    expect(sent().url).toBe(`${API}/subscriptions-v2`);
  });

  it.each(["", "   "])(
    "never widens a blank external_id filter %j to the whole list",
    async (external_id) => {
      await expect(client.listSubscriptions({ external_id })).rejects.toMatchObject({
        type: "validation_error",
        code: "invalid_request",
        param: "external_id",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "   "])(
    "never sends a card request without its owner %j",
    async (owner) => {
      const saved = { customer_id: owner } as unknown as { customer_id: string };
      const payout = { customer_reference: owner } as unknown as { customer_reference: string };
      const calls: Array<[string, () => Promise<unknown>]> = [
        ["customer_id", () => client.listSavedCards(saved)],
        ["customer_id", () => client.deleteSavedCard("tok_1", saved)],
        ["customer_reference", () => client.listCustomerTransferCards(payout)],
        ["customer_reference", () => client.getCustomerTransferCard("tok_1", payout)],
      ];
      for (const [param, call] of calls) {
        await expect(call()).rejects.toMatchObject({ type: "validation_error", param });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("cancels at once with an empty body by default", async () => {
    await client.cancelSubscription("sub_1");

    expect(sent()).toMatchObject({ url: `${API}/subscriptions-v2/sub_1/cancel`, method: "POST" });
    expect(sent().body).toEqual({});
    expect(sent().headers).not.toHaveProperty("Idempotency-Key");
  });

  it("schedules a cancellation at period end", async () => {
    await client.cancelSubscription("sub_1", {
      cancel_at_period_end: true,
      cancel_reason: "downgrade",
    });

    expect(sent().body).toEqual({ cancel_at_period_end: true, cancel_reason: "downgrade" });
  });

  it.each([
    [
      "uncancel",
      (c: ArcPayClient, o?: RequestOptions) => c.uncancelSubscription("sub_1", o),
      undefined,
    ],
    [
      "pause",
      (c: ArcPayClient, o?: RequestOptions) =>
        c.pauseSubscription("sub_1", { pause_until: "2027-01-01T00:00:00Z" }, o),
      { pause_until: "2027-01-01T00:00:00Z" },
    ],
    [
      "resume",
      (c: ArcPayClient, o?: RequestOptions) => c.resumeSubscription("sub_1", o),
      undefined,
    ],
  ])("posts %s and does not replay it without a key", async (action, call, body) => {
    fetchMock.mockImplementation(async () =>
      ok({ error: { type: "api_error", code: "service_unavailable" } }, 503),
    );

    await expect(call(client)).rejects.toMatchObject({ code: "service_unavailable" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({
      url: `${API}/subscriptions-v2/sub_1/${action}`,
      method: "POST",
    });
    expect(sent().body).toEqual(body);
  });

  it("pauses without an end date", async () => {
    await client.pauseSubscription("sub_1");

    expect(sent().body).toEqual({});
  });

  it("retries billing and replays a transient failure with the same key", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ error: { type: "api_error" } }, 503))
      .mockResolvedValueOnce(ok({ id: "cycle_1", status: "pending" }));

    const cycle = await client.retrySubscriptionBilling("sub_1", {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(cycle.id).toBe("cycle_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of [0, 1]) {
      expect(sent(call)).toMatchObject({
        url: `${API}/subscriptions-v2/sub_1/retry`,
        method: "POST",
      });
      expect(sent(call).headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
      expect(sent(call).body).toBeUndefined();
    }
  });

  it("lists billing cycles with pagination", async () => {
    await client.listSubscriptionBillingCycles("sub_1", { limit: 5, cursor: "next" });

    expect(sent()).toMatchObject({
      url: `${API}/subscriptions-v2/sub_1/billing-cycles?limit=5&cursor=next`,
      method: "GET",
    });
  });

  it("lists saved cards of a customer", async () => {
    fetchMock.mockResolvedValue(ok({ cards: [] }));

    await expect(client.listSavedCards({ customer_id: "cust 1" })).resolves.toEqual({
      cards: [],
    });

    expect(sent()).toMatchObject({ url: `${API}/cards?customer_id=cust+1`, method: "GET" });
  });

  it("deletes a saved card and resolves on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      client.deleteSavedCard("tok/1", { customer_id: "cust_1" }),
    ).resolves.toBeUndefined();

    expect(sent()).toMatchObject({
      url: `${API}/cards/tok%2F1?customer_id=cust_1`,
      method: "DELETE",
    });
    expect(sent().body).toBeUndefined();
  });

  it("lists payout cards of a recipient", async () => {
    fetchMock.mockResolvedValue(ok({ cards: [] }));

    await client.listCustomerTransferCards({ customer_reference: "rcp_1" });

    expect(sent()).toMatchObject({
      url: `${API}/customer-transfer-cards?customer_reference=rcp_1`,
      method: "GET",
    });
  });

  it("gets a payout card and surfaces card_token_unavailable", async () => {
    fetchMock.mockImplementation(async () =>
      ok({ error: { type: "validation_error", code: "card_token_unavailable" } }, 404),
    );

    await expect(
      client.getCustomerTransferCard("tok/1", { customer_reference: "rcp_1" }),
    ).rejects.toMatchObject({ code: "card_token_unavailable", retryable: false });

    expect(sent()).toMatchObject({
      url: `${API}/customer-transfer-cards/tok%2F1?customer_reference=rcp_1`,
      method: "GET",
    });
  });

  describe("attach payment, billing hold and terms update", () => {
    const SUB = "22222222-2222-7222-8222-222222222222";
    const HOLD = "33333333-3333-7333-8333-333333333333";
    const PAY = "44444444-4444-7444-8444-444444444444";
    const base = `${API}/subscriptions-v2/${SUB}`;

    it("sends save_card on create payment and initial_payment_id on create subscription", async () => {
      await client.createPayment(
        {
          amount: 10000,
          currency: "RUB",
          payment_method: "bank_card",
          external_id: "p1",
          capture_mode: "auto",
          customer_id: "cust_1",
          save_card: true,
        },
        { idempotencyKey: IDEMPOTENCY_KEY },
      );
      expect(sent(0).url).toBe(`${API}/payments`);
      expect(sent(0).body.save_card).toBe(true);

      await client.createSubscription(
        {
          customer_id: "cust_1",
          amount: 10000,
          currency: "RUB",
          billing_interval_type: "month",
          billing_interval_count: 1,
          payment_method: "bank_card",
          initial_payment_id: PAY,
        },
        { idempotencyKey: IDEMPOTENCY_KEY },
      );
      expect(sent(1).body.initial_payment_id).toBe(PAY);
    });

    const cases: Array<
      [string, () => Promise<unknown>, string, string, unknown]
    > = [];
    const opts = { idempotencyKey: IDEMPOTENCY_KEY };
    const add = (
      name: string,
      call: () => Promise<unknown>,
      method: string,
      url: string,
      body: unknown,
    ) => cases.push([name, call, method, url, body]);
    add(
      "createBillingHold",
      () => client.createBillingHold(SUB, { expires_in: 600 }, opts),
      "POST",
      `${base}/billing-hold`,
      { expires_in: 600 },
    );
    add(
      "bindBillingHoldPayment",
      () =>
        client.bindBillingHoldPayment(
          SUB,
          { hold_id: HOLD, payment_id: PAY },
          opts,
        ),
      "POST",
      `${base}/billing-hold/payment`,
      { hold_id: HOLD, payment_id: PAY },
    );
    add(
      "releaseBillingHold",
      () => client.releaseBillingHold(SUB, HOLD, opts),
      "DELETE",
      `${base}/billing-hold?hold_id=${HOLD}`,
      undefined,
    );
    add(
      "paySubscription",
      () => client.paySubscription(SUB, { payment_id: PAY }, opts),
      "POST",
      `${base}/pay`,
      { payment_id: PAY },
    );
    add(
      "updateSubscriptionTerms",
      () =>
        client.updateSubscriptionTerms(
          SUB,
          {
            apply: "now",
            amount: 15000,
            payment_id: PAY,
            top_up_amount: 5000,
            expected_current_period_end: "2026-12-01T00:00:00Z",
          },
          opts,
        ),
      "POST",
      `${base}/update`,
      {
        apply: "now",
        amount: 15000,
        payment_id: PAY,
        top_up_amount: 5000,
        expected_current_period_end: "2026-12-01T00:00:00Z",
      },
    );
    add(
      "cancelPendingSubscriptionUpdate",
      () => client.cancelPendingSubscriptionUpdate(SUB, opts),
      "DELETE",
      `${base}/pending-update`,
      undefined,
    );

    it.each(cases)(
      "%s sends path, method, body and Idempotency-Key",
      async (_n, call, method, url, body) => {
        await call();
        expect(sent()).toMatchObject({ url, method });
        expect(sent().headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
        expect(sent().body).toEqual(body);
      },
    );

    it.each([
      ["createBillingHold", () => (client as unknown as Loose).createBillingHold(SUB, {})],
      [
        "bindBillingHoldPayment",
        () =>
          (client as unknown as Loose).bindBillingHoldPayment(SUB, {
            hold_id: HOLD,
            payment_id: PAY,
          }),
      ],
      [
        "releaseBillingHold",
        () => (client as unknown as Loose).releaseBillingHold(SUB, HOLD),
      ],
      [
        "paySubscription",
        () => (client as unknown as Loose).paySubscription(SUB, { payment_id: PAY }),
      ],
      [
        "updateSubscriptionTerms",
        () =>
          (client as unknown as Loose).updateSubscriptionTerms(SUB, {
            apply: "next_period",
            amount: 1,
          }),
      ],
      [
        "cancelPendingSubscriptionUpdate",
        () => (client as unknown as Loose).cancelPendingSubscriptionUpdate(SUB),
      ],
    ])("%s refuses to run without an Idempotency-Key", async (_n, call) => {
      await expect(call()).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
