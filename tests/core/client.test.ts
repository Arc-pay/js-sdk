import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/core/client";
import { ArcPayError } from "../../src/core/errors";

const IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a31";

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends API key, version header, and JSON content-type", async () => {
    fetchMock.mockResolvedValue(ok({ payment_id: "pay_123" }));
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await c.post("/v1/payments/pay_123/tokenize", { pan: "..." });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.arcpay.space/v1/payments/pay_123/tokenize");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer pk_test_x");
    expect(init.headers["X-Arc-Pay-API-Version"]).toBe("2026-05-06");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ pan: "..." }));
  });

  it("includes Idempotency-Key header when provided", async () => {
    fetchMock.mockResolvedValue(ok({}));
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await c.post(
      "/v1/payments/pay_123/execute",
      { card_token_id: "t" },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
  });

  it("rejects non-UUID idempotency keys before sending", async () => {
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });

    await expect(
      c.post("/v1/payments/pay_123/execute", {}, { idempotencyKey: "exec-1" }),
    ).rejects.toMatchObject({
      type: "validation_error",
      code: "invalid_idempotency_key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses RFC 7807-shaped error into ArcPayError", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "validation_error",
            code: "invalid_card_number",
            message: "Card number failed Luhn check",
            param: "pan",
            request_id: "req_abc",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await expect(c.post("/v1/payments/pay_123/tokenize", {})).rejects.toMatchObject({
      type: "validation_error",
      code: "invalid_card_number",
      param: "pan",
      requestId: "req_abc",
      retryable: false,
    });
  });

  it("wraps network failure into ArcPayError(network_error)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await expect(c.post("/v1/p/x/tokenize", {})).rejects.toBeInstanceOf(ArcPayError);
    await expect(c.post("/v1/p/x/tokenize", {})).rejects.toMatchObject({
      type: "network_error",
      retryable: true,
    });
  });

  it("flags 5xx as retryable api_error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { type: "internal_error", message: "boom" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await expect(c.post("/x", {})).rejects.toMatchObject({
      type: "api_error",
      retryable: true,
    });
  });

  it("marks rate limit errors retryable and preserves Retry-After", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: "rate_limit_error",
            code: "rate_limited",
            message: "Too many requests",
          },
        }),
        { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } },
      ),
    );
    const c = createClient({ apiBase: "https://api.arcpay.space", publishableKey: "pk_test_x" });
    await expect(c.post("/x", {})).rejects.toMatchObject({
      type: "rate_limit_error",
      retryable: true,
      retryAfterSeconds: 60,
    });
  });
});
