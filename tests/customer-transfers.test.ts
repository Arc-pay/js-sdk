import { afterEach, expect, it, vi } from "vitest";
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
