import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArcPayClient, createArcPayClient } from "../../src/server";
import { ArcPayError } from "../../src/core/errors";

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

  afterEach(() => vi.restoreAllMocks());

  it("rejects publishable keys on server APIs", () => {
    expect(() => createArcPayClient({ secretKey: "pk_test_x", fetch: fetchMock as unknown as typeof fetch })).toThrowError(
      ArcPayError,
    );
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
      { idempotencyKey: "idem-1" },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/payments");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test_x");
    expect(init.headers["X-Arc-Pay-API-Version"]).toBe("2026-05-06");
    expect(init.headers["Idempotency-Key"]).toBe("idem-1");
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

    await expect(client.capturePayment("pay_1", {}, { idempotencyKey: "cap-1" })).rejects.toMatchObject({
      type: "state_error",
      code: "invalid_state",
      requestId: "req_1",
    });
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
      { idempotencyKey: "checkout-1" },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("checkout-1");
  });
});
