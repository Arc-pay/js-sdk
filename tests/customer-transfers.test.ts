import { afterEach, expect, it, vi } from "vitest";
import type { CustomerTransferSession } from "../src/server/customer-transfers";
import { createCustomerTransferSessionClient } from "../src/customer-transfers/index";

afterEach(() => vi.unstubAllGlobals());
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const CARD_ENTRY = "https://cards.example.test/v1/card-entry/transfer-pan";
const transferFetch = () =>
  vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ ticket: "tkt", card_entry_url: CARD_ENTRY, expires_at: "2030-01-01T00:00:00Z" }),
    )
    .mockResolvedValueOnce(jsonResponse({ card_token_id: "token" }))
    .mockResolvedValueOnce(jsonResponse({ card_token_id: "token", card_mask: "masked" }));

it("sends the PAN only to card-entry and attaches the token without merchant credentials", async () => {
  const fetchSpy = transferFetch();
  vi.stubGlobal("fetch", fetchSpy);
  const session = createCustomerTransferSessionClient("session", "https://dev-api.arcpay.space");
  await session.tokenizeCard({
    pan: "4532015112830366",
    recipient_email: "recipient@example.test",
  });
  const [ticketUrl, ticketRequest] = fetchSpy.mock.calls[0]!;
  expect(ticketUrl).toBe(
    "https://dev-api.arcpay.space/v1/customer-transfer-sessions/session/card-entry-ticket",
  );
  expect(JSON.parse(ticketRequest.body)).toEqual({});

  const [cardUrl, cardRequest] = fetchSpy.mock.calls[1]!;
  expect(cardUrl).toBe(CARD_ENTRY);
  expect(JSON.parse(cardRequest.body)).toEqual({ pan: "4532015112830366" });
  expect(cardRequest.headers).toMatchObject({ "X-Card-Entry-Ticket": "tkt" });
  expect(cardRequest.headers).not.toHaveProperty("Authorization");

  const [attachUrl, attachRequest] = fetchSpy.mock.calls[2]!;
  expect(attachUrl).toBe("https://dev-api.arcpay.space/v1/customer-transfer-sessions/session/card");
  expect(attachRequest.headers).not.toHaveProperty("Authorization");
  const payload = JSON.parse(attachRequest.body);
  expect(payload).toEqual({ recipient_email: "recipient@example.test", card_token_id: "token" });
  expect(payload).not.toHaveProperty("pan");
  expect(payload).not.toHaveProperty("cvv");
});
it("does not submit invalid recipient PAN", () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  expect(() =>
    createCustomerTransferSessionClient("session").tokenizeCard({ pan: "invalid" }),
  ).toThrow("Invalid recipient PAN");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("omits blank optional metadata from the attach step", async () => {
  const fetchSpy = transferFetch();
  vi.stubGlobal("fetch", fetchSpy);
  await createCustomerTransferSessionClient("session").tokenizeCard({
    pan: "4532015112830366",
    recipient_first_name: " ",
    recipient_email: "",
    sender_name: " Merchant LLC ",
    recipient_profile: { first_name: " ", city: " Moscow " },
  });
  const request = fetchSpy.mock.calls[2]![1];
  expect(JSON.parse(request.body)).toEqual({
    card_token_id: "token",
    sender_name: "Merchant LLC",
    recipient_profile: { city: "Moscow" },
  });
});

it("preserves hosted outcome and review metadata for automatic recipient updates", async () => {
  const payload: CustomerTransferSession = {
    session_id: "session",
    amount: 100,
    source_debit: 100,
    fee: 0,
    currency: "RUB",
    purpose_code: "customer_refund",
    status: "submitted",
    environment: "sandbox",
    expires_at: "2026-10-07T00:00:00Z",
    disbursement_status: "outcome_unknown",
    reservation_status: "consumed",
    manual_reconciliation_required: true,
    retry_policy: "contact_support",
    merchant_name: "Test merchant",
    next_check_at: "2026-10-06T00:05:00Z",
    card: { card_mask: "411111******1111" },
  };
  const fetchSpy = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchSpy);
  const result = await createCustomerTransferSessionClient(
    "session",
    "https://dev-api.arcpay.space",
  ).get();
  expect(result).toEqual(payload);
  expect(result.disbursement_status).toBe("outcome_unknown");
  expect(result.manual_reconciliation_required).toBe(true);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});
