import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArcPay } from "../../src/core/arcpay";
import { createClient } from "../../src/core/client";
import { tokenize } from "../../src/tokenize/tokenize";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const VALID = {
  paymentId: "pay_abc",
  pan: "4242424242424242",
  cvv: "123",
  expiryMonth: "12",
  expiryYear: "2030",
};

describe("raw tokenize transport", () => {
  beforeEach(() => {
    ArcPay.__resetForTests();
  });

  it("is not exposed on the public ArcPay browser instance", async () => {
    const arcpay = await ArcPay.load("pk_test_x");
    expect("tokenize" in arcpay).toBe(false);
  });

  const TOKEN = {
    card_token_id: "tok_xyz",
    card_mask: "424242XXXXXX4242",
    card_scheme: "visa",
    card_bin: "42424242",
    expires_in: 300,
    expires_at: "2026-05-08T00:05:00Z",
  };
  const CARD_ENTRY = "https://cards.example.test/v1/card-entry/payment";
  const ticketResponse = (ticket: string) =>
    ok({ ticket, card_entry_url: CARD_ENTRY, expires_at: "2026-05-08T00:05:00Z" });
  const newClient = () =>
    createClient({ apiBase: "https://api.example.test", publishableKey: "pk_test_x" });

  it("happy path: requests a ticket, then posts only the card to card-entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ticketResponse("tkt_1"))
      .mockResolvedValueOnce(ok(TOKEN));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await tokenize(newClient(), VALID);

    expect(out).toEqual({
      cardTokenId: "tok_xyz",
      cardMask: "424242XXXXXX4242",
      cardScheme: "visa",
      cardBin: "42424242",
      expiresIn: 300,
      expiresAt: "2026-05-08T00:05:00Z",
    });
    const [ticketUrl, ticketInit] = fetchMock.mock.calls[0]!;
    expect(ticketUrl).toBe("https://api.example.test/v1/payments/pay_abc/card-entry-ticket");
    expect(JSON.parse(ticketInit.body as string)).toEqual({});

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(CARD_ENTRY);
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual([
      "cvv",
      "expiry_month",
      "expiry_year",
      "pan",
    ]);
    expect(JSON.parse(init.body as string)).toEqual({
      pan: VALID.pan,
      cvv: VALID.cvv,
      expiry_month: VALID.expiryMonth,
      expiry_year: VALID.expiryYear,
    });
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Card-Entry-Ticket": "tkt_1",
    });
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("retries once with a fresh ticket after ticket_invalid", async () => {
    const invalid = () =>
      ok({ error: { type: "authentication_error", code: "ticket_invalid", message: "m" } }, 401);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ticketResponse("tkt_1"))
      .mockResolvedValueOnce(invalid())
      .mockResolvedValueOnce(ticketResponse("tkt_2"))
      .mockResolvedValueOnce(ok(TOKEN));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(tokenize(newClient(), VALID)).resolves.toMatchObject({ cardTokenId: "tok_xyz" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1].headers["X-Card-Entry-Ticket"]).toBe("tkt_2");
  });

  it("gives up after a second ticket_invalid without leaking card data", async () => {
    const invalid = () =>
      ok({ error: { type: "authentication_error", code: "ticket_invalid", message: "m" } }, 401);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ticketResponse("tkt_1"))
      .mockResolvedValueOnce(invalid())
      .mockResolvedValueOnce(ticketResponse("tkt_2"))
      .mockResolvedValueOnce(invalid());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const err = await tokenize(newClient(), VALID).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "ticket_invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(VALID.pan);
  });

  it("never posts card data to the API host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        ok({ ticket: "t", card_entry_url: "https://api.example.test/v1/payments/x/tokenize" }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(tokenize(newClient(), VALID)).rejects.toMatchObject({
      code: "invalid_card_entry_url",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid PAN before network call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = createClient({
      apiBase: "https://api.example.test",
      publishableKey: "pk_test_x",
    });
    await tokenize(client, { ...VALID, pan: "1111111111111111" }).then(
      () => {
        throw new Error("tokenize should reject an invalid PAN before network call");
      },
      (err: unknown) => {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/luhn/i);
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
