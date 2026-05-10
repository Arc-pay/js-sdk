import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArcPay } from "../../src/core/arcpay";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const VALID = {
  paymentId: "pay_abc",
  pan: "4242424242424242",
  cvv: "123",
  expiryMonth: "12",
  expiryYear: "2030",
};

describe("arcpay.tokenize", () => {
  beforeEach(() => {
    ArcPay.__resetForTests();
  });

  it("happy path: posts to /tokenize and returns mapped response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        card_token_id: "tok_xyz",
        card_mask: "424242XXXXXX4242",
        card_scheme: "visa",
        card_bin: "42424242",
        expires_at: "2026-05-08T00:05:00Z",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const arcpay = await ArcPay.load("pk_test_x");
    const out = await arcpay.tokenize(VALID);

    expect(out).toEqual({
      cardTokenId: "tok_xyz",
      cardMask: "424242XXXXXX4242",
      cardScheme: "visa",
      cardBin: "42424242",
      expiresAt: "2026-05-08T00:05:00Z",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/v1\/payments\/pay_abc\/tokenize$/);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      pan: VALID.pan,
      cvv: VALID.cvv,
      expiry_month: VALID.expiryMonth,
      expiry_year: VALID.expiryYear,
    });
  });

  it("includes cardholder_name if provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        card_token_id: "t",
        card_mask: "x",
        card_scheme: "visa",
        card_bin: "42424242",
        expires_at: "x",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const arcpay = await ArcPay.load("pk_test_x");
    await arcpay.tokenize({ ...VALID, cardholderName: "JOHN DOE" });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.cardholder_name).toBe("JOHN DOE");
  });

  it("rejects invalid PAN before network call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const arcpay = await ArcPay.load("pk_test_x");
    await expect(arcpay.tokenize({ ...VALID, pan: "1111111111111111" })).rejects.toThrow(/luhn/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
