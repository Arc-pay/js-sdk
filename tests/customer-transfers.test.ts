import { afterEach, expect, it, vi } from "vitest";
import type { CustomerTransferSession } from "../src/server/customer-transfers";
import { createCustomerTransferSessionClient } from "../src/customer-transfers/index";

afterEach(() => vi.unstubAllGlobals());
it("sends PAN-only recipient tokenization without merchant credentials", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ card_token_id: "token", card_mask: "masked" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  const session = createCustomerTransferSessionClient("session", "https://dev-api.arcpay.space");
  await session.tokenizeCard({
    pan: "4532015112830366",
    recipient_email: "recipient@example.test",
  });
  const [url, request] = fetchSpy.mock.calls[0]!;
  expect(url).toBe("https://dev-api.arcpay.space/v1/customer-transfer-sessions/session/tokenize");
  expect(request.headers).not.toHaveProperty("Authorization");
  const payload = JSON.parse(request.body);
  expect(Object.keys(payload).sort()).toEqual(["pan", "recipient_email"]);
  expect(payload).not.toHaveProperty("cvv");
  expect(payload).not.toHaveProperty("expiry_month");
});
it("does not submit invalid recipient PAN", () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  expect(() =>
    createCustomerTransferSessionClient("session").tokenizeCard({ pan: "invalid" }),
  ).toThrow("Invalid recipient PAN");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("omits blank optional metadata from recipient tokenization", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ card_token_id: "token", card_mask: "masked" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  await createCustomerTransferSessionClient("session").tokenizeCard({
    pan: "4532015112830366",
    recipient_first_name: " ",
    recipient_email: "",
    sender_name: " Merchant LLC ",
    recipient_profile: { first_name: " ", city: " Moscow " },
  });
  const request = fetchSpy.mock.calls[0]![1];
  expect(JSON.parse(request.body)).toEqual({
    pan: "4532015112830366",
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
