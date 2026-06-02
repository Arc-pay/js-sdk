import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SDK_VERSION } from "../../src";
import { ArcPayClient, createArcPayClient } from "../../src/server";
import { ArcPayError } from "../../src/core/errors";

const IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a31";
const CAPTURE_IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a32";
const EXECUTE_IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a33";
const CHECKOUT_IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a34";

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("server ArcPayClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects publishable keys on server APIs", () => {
    expect(() =>
      createArcPayClient({ secretKey: "pk_test_x", fetch: fetchMock as unknown as typeof fetch }),
    ).toThrowError(ArcPayError);
  });

  it("creates a payment with secret key, API version, and idempotency key", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id: "11111111-1111-1111-1111-111111111111",
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        status: "created",
        created_at: "2026-05-12T09:00:00Z",
        updated_at: "2026-05-12T09:00:00Z",
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      apiBase: "https://api.example.test/v1/",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.createPayment(
      {
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        external_id: "order-1",
        capture_mode: "one_stage",
      },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/payments");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test_x");
    expect(init.headers["X-Arc-Pay-API-Version"]).toBe("2026-05-06");
    expect(init.headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
    expect(init.headers["User-Agent"]).toBe(`ArcPay-JS/${SDK_VERSION}`);
  });

  it("retries transient API errors with the same idempotency key", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "api_error",
              code: "service_unavailable",
              message: "dependency unavailable",
              request_id: "req_retry_1",
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        ok({
          id: "11111111-1111-1111-1111-111111111111",
          amount: 10000,
          currency: "RUB",
          payment_method: "bank_card",
          status: "created",
          created_at: "2026-05-12T09:00:00Z",
          updated_at: "2026-05-12T09:00:00Z",
        }),
      );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 1,
      retryDelayMs: () => 0,
    });

    await client.createPayment(
      {
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        external_id: "order-retry",
        capture_mode: "one_stage",
      },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1].headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
    expect(fetchMock.mock.calls[1]?.[1].headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
  });

  it("does not retry Arc Pay timeout responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "api_error",
            code: "timeout",
            message: "processing timeout; poll payment status",
            request_id: "req_timeout",
          },
        }),
        { status: 504, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 2,
      retryDelayMs: () => 0,
    });

    await expect(
      client.createPayment(
        {
          amount: 10000,
          currency: "RUB",
          payment_method: "bank_card",
          external_id: "order-timeout",
          capture_mode: "one_stage",
        },
        { idempotencyKey: IDEMPOTENCY_KEY },
      ),
    ).rejects.toMatchObject({
      code: "timeout",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts requests after the configured timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
      timeoutMs: 10,
      maxNetworkRetries: 0,
    });

    const paymentPromise = client.createPayment(
      {
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        external_id: "order-timeout-ms",
        capture_mode: "one_stage",
      },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );
    const assertion = expect(paymentPromise).rejects.toMatchObject({
      type: "api_error",
      code: "request_timeout",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
    vi.useRealTimers();
  });

  it("creates a card setup intent", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id: "11111111-1111-1111-1111-111111111112",
        amount: 0,
        currency: "RUB",
        payment_method: "bank_card",
        status: "created",
        created_at: "2026-05-12T09:00:00Z",
        updated_at: "2026-05-12T09:00:00Z",
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      apiBase: "https://api.example.test/v1/",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.createCardSetup(
      {
        currency: "RUB",
        customer_id: "cust-42",
        success_url: "https://merchant.example.com/success",
        fail_url: "https://merchant.example.com/fail",
      },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/cards/setup");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
  });

  it("does not expose paid save_card in createPayment request typing", () => {
    const request = {
      amount: 10000,
      currency: "RUB",
      payment_method: "bank_card",
      external_id: "order-card-setup",
      capture_mode: "one_stage",
      success_url: "https://merchant.example/success",
      fail_url: "https://merchant.example/fail",
    } satisfies Parameters<ArcPayClient["createPayment"]>[0];

    // @ts-expect-error Saved-card setup is only POST /cards/setup.
    const legacyRequest: Parameters<ArcPayClient["createPayment"]>[0] = {
      ...request,
      save_card: true,
    };
    expect(legacyRequest).toBeDefined();
  });

  it("validates required idempotency keys for mandatory operations", async () => {
    const idempotentClient = new ArcPayClient({
      secretKey: "sk_test_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const createPaymentWithoutIdempotencyOptions = () =>
      // @ts-expect-error idempotency options are required at compile time.
      idempotentClient.createPayment({
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        external_id: "order-typecheck",
        capture_mode: "one_stage",
      });
    void createPaymentWithoutIdempotencyOptions;
    const completeThreeDSMethodWithoutIdempotencyOptions = () =>
      // @ts-expect-error idempotency options are required at compile time.
      idempotentClient.completeThreeDSMethod("pay_1", {
        completion_indicator: "Y",
        three_ds_server_trans_id: "019e6b4e-ae3b-7776-8a56-7c0f8db5e303",
      });
    void completeThreeDSMethodWithoutIdempotencyOptions;
    const cancelLinkWithoutIdempotencyOptions = () =>
      // @ts-expect-error idempotency options are required at compile time.
      idempotentClient.cancelLink("link_1");
    void cancelLinkWithoutIdempotencyOptions;

    const requiredMethods = [
      {
        name: "createPayment",
        invoke: (opts: unknown) =>
          idempotentClient.createPayment(
            {
              amount: 10000,
              currency: "RUB",
              payment_method: "bank_card",
              external_id: "order-1",
              capture_mode: "one_stage",
            },
            opts as any,
          ),
      },
      {
        name: "createCardSetup",
        invoke: (opts: unknown) =>
          idempotentClient.createCardSetup(
            {
              currency: "RUB",
              customer_id: "cust-42",
              success_url: "https://merchant.example.com/success",
              fail_url: "https://merchant.example.com/fail",
            },
            opts as any,
          ),
      },
      {
        name: "createLink",
        invoke: (opts: unknown) =>
          idempotentClient.createLink(
            {
              link_type: "one_time",
              amount: 10000,
              currency: "RUB",
              capture_mode: "one_stage",
              payment_methods: [{ method: "bank_card", payment_mode: "h2h" }],
            },
            opts as any,
          ),
      },
      {
        name: "createCheckoutSession",
        invoke: (opts: unknown) =>
          idempotentClient.createCheckoutSession(
            {
              amount: 10000,
              currency: "RUB",
              payment_methods: [{ method: "bank_card", payment_mode: "h2h" }],
              capture_mode: "one_stage",
            },
            opts as any,
          ),
      },
      {
        name: "capturePayment",
        invoke: (opts: unknown) =>
          idempotentClient.capturePayment("pay_1", { amount: 5000 }, opts as any),
      },
      {
        name: "voidPayment",
        invoke: (opts: unknown) => idempotentClient.voidPayment("pay_1", {}, opts as any),
      },
      {
        name: "createRefund",
        invoke: (opts: unknown) =>
          idempotentClient.createRefund("pay_1", { amount: 5000 }, opts as any),
      },
      {
        name: "executePayment",
        invoke: (opts: unknown) =>
          idempotentClient.executePayment(
            "pay_1",
            {
              payment_method: "bank_card",
              card_token_id: "tok_1",
              payment_mode: "h2h",
              browser_info: {
                accept_header: "",
                language: "en",
                screen_width: 390,
                screen_height: 844,
                color_depth: 24,
                timezone_offset_minutes: 0,
                java_enabled: true,
                user_agent: "Mozilla/5.0",
                window_size: "01",
              },
            },
            opts as any,
          ),
      },
      {
        name: "completeThreeDSMethod",
        invoke: (opts: unknown) =>
          idempotentClient.completeThreeDSMethod(
            "pay_1",
            {
              completion_indicator: "Y",
              three_ds_server_trans_id: "019e6b4e-ae3b-7776-8a56-7c0f8db5e303",
            },
            opts as any,
          ),
      },
      {
        name: "cancelLink",
        invoke: (opts: unknown) => idempotentClient.cancelLink("link_1", opts as any),
      },
    ];

    for (const method of requiredMethods) {
      await expect(method.invoke(undefined)).rejects.toMatchObject({
        type: "validation_error",
        code: "missing_idempotency_key",
      });
      await expect(method.invoke(null)).rejects.toMatchObject({
        type: "validation_error",
        code: "missing_idempotency_key",
      });
      await expect(method.invoke({ idempotencyKey: "not-a-uuid" })).rejects.toMatchObject({
        type: "validation_error",
        code: "invalid_idempotency_key",
      });
    }
  });

  it("serializes list payments query parameters", async () => {
    fetchMock.mockResolvedValue(ok({ payments: [], total: 0, page: 1, page_size: 20 }));
    const client = new ArcPayClient({
      secretKey: "sk_live_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.listPayments({
      status: "captured",
      payment_method: "bank_card",
      search: "order-1",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.test/v1/payments?status=captured&payment_method=bank_card&search=order-1",
    );
    expect(init.method).toBe("GET");
  });

  it("polls payment status until a terminal state", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          id: "pay_1",
          amount: 10000,
          currency: "RUB",
          payment_method: "bank_card",
          status: "pending_3ds",
          created_at: "2026-05-12T09:00:00Z",
          updated_at: "2026-05-12T09:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          id: "pay_1",
          amount: 10000,
          currency: "RUB",
          payment_method: "bank_card",
          status: "captured",
          created_at: "2026-05-12T09:00:00Z",
          updated_at: "2026-05-12T09:00:02Z",
        }),
      );
    const client = new ArcPayClient({
      secretKey: "sk_live_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const payment = await client.waitForPaymentTerminal("pay_1", {
      intervalMs: 1,
      timeoutMs: 100,
    });

    expect(payment.status).toBe("captured");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.test/v1/payments/pay_1");
  });

  it("returns a non-terminal polling result with diagnostics", async () => {
    fetchMock.mockImplementation(() =>
      ok({
        id: "pay_1",
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        status: "pending_3ds",
        created_at: "2026-05-12T09:00:00Z",
        updated_at: "2026-05-12T09:00:00Z",
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_live_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.waitForPaymentTerminalResult("pay_1", {
      intervalMs: 1,
      timeoutMs: 1,
    });

    expect(result).toMatchObject({
      status: "non_terminal",
      payment_status: "pending_3ds",
      reason: "timeout",
    });
    expect(result.attempts).toBeGreaterThanOrEqual(1);
  });

  it("includes the last non-terminal status when waitForPaymentTerminal times out", async () => {
    fetchMock.mockImplementation(() =>
      ok({
        id: "pay_1",
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        status: "pending",
        created_at: "2026-05-12T09:00:00Z",
        updated_at: "2026-05-12T09:00:00Z",
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_live_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.waitForPaymentTerminal("pay_1", {
        intervalMs: 1,
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({
      code: "payment_poll_timeout",
      message: expect.stringContaining("stayed pending"),
    });
  });

  it("maps public API error envelopes into ArcPayError", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "state_error",
            code: "invalid_state",
            message: "payment is not authorized",
            request_id: "req_1",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.capturePayment("pay_1", {}, { idempotencyKey: CAPTURE_IDEMPOTENCY_KEY }),
    ).rejects.toMatchObject({
      type: "state_error",
      code: "invalid_state",
      requestId: "req_1",
    });
  });

  it("marks payment timeout responses as non-retryable", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "api_error",
            code: "timeout",
            message: "processing timeout; poll payment status",
            request_id: "req_timeout",
          },
        }),
        { status: 504, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.executePayment(
        "pay_1",
        {
          payment_method: "bank_card",
          card_token_id: "tok_1",
          payment_mode: "h2h",
          browser_info: {},
        } as any,
        { idempotencyKey: EXECUTE_IDEMPOTENCY_KEY },
      ),
    ).rejects.toMatchObject({
      type: "api_error",
      code: "timeout",
      retryable: false,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      payment_method: "bank_card",
      card_token_id: "tok_1",
      payment_mode: "h2h",
    });
  });

  it("executes a wallet payment request", async () => {
    fetchMock.mockResolvedValue(
      ok({
        payment_id: "pay_1",
        status: "pending",
        payment_mode: "h2h",
        wallet_action: {
          provider: "sberpay",
          action: "qr",
          qr_url: "https://bank.example/sberpay/qr/123",
        },
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.executePayment(
      "pay_1",
      {
        payment_method: "sberpay",
        payment_mode: "h2h",
        wallet_interaction: {
          provider: "sberpay",
          surface: "merchant_web",
          action: "qr",
        },
      },
      { idempotencyKey: EXECUTE_IDEMPOTENCY_KEY },
    );

    expect(result.wallet_action?.provider).toBe("sberpay");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      payment_method: "sberpay",
      payment_mode: "h2h",
      wallet_interaction: {
        provider: "sberpay",
        surface: "merchant_web",
        action: "qr",
      },
    });
  });

  it("rejects executePayment requests without explicit h2h payment_mode", async () => {
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.executePayment(
        "pay_1",
        {
          payment_method: "bank_card",
          card_token_id: "tok_1",
          browser_info: {},
        } as any,
        { idempotencyKey: EXECUTE_IDEMPOTENCY_KEY },
      ),
    ).rejects.toMatchObject({
      type: "validation_error",
      code: "invalid_payment_mode",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completes 3DS Method with a required idempotency key", async () => {
    fetchMock.mockResolvedValue(ok({ payment_id: "pay_1", status: "pending_3ds" }));
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.completeThreeDSMethod(
      "pay_1",
      {
        completion_indicator: "Y",
        three_ds_server_trans_id: "019e6b4e-ae3b-7776-8a56-7c0f8db5e303",
      },
      {
        idempotencyKey: "019e6b4e-ae3b-7776-8a56-7c0f8db5e304",
      },
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers["Idempotency-Key"]).toBe("019e6b4e-ae3b-7776-8a56-7c0f8db5e304");
  });

  it("parses empty successful responses as undefined", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.cancelLink("link_1", { idempotencyKey: "019e6b4e-ae3b-7776-8a56-7c0f8db5e305" }),
    ).resolves.toBeUndefined();
  });

  it("creates a checkout session with an idempotency key", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id: "11111111-1111-1111-1111-111111111111",
        url: "https://pay.example.test/checkout/11111111-1111-1111-1111-111111111111",
      }),
    );
    const client = new ArcPayClient({
      secretKey: "sk_test_x",
      apiBase: "https://api.example.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.createCheckoutSession(
      {
        amount: 10000,
        currency: "RUB",
        payment_methods: [{ method: "bank_card", payment_mode: "redirect" }],
        capture_mode: "one_stage",
        success_url: "https://shop.example/success",
        fail_url: "https://shop.example/fail",
      },
      { idempotencyKey: CHECKOUT_IDEMPOTENCY_KEY },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe(CHECKOUT_IDEMPOTENCY_KEY);
  });
});
