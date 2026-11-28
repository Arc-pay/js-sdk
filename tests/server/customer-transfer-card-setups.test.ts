import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArcPayClient } from "../../src/server";
import type { ArcPayClient } from "../../src/server/client";
import type {
  CreateCustomerTransferCardSetupRequest,
  CustomerTransferCardSetup,
} from "../../src/server/customer-transfers";
import { ArcPayError } from "../../src/core/errors";

const IDEMPOTENCY_KEY = "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a36";
const SETUP_ID = "6b1d2c9e-6b1f-4e5a-9a2c-1f0e4f2a3b4c";
const API = "https://dev-api.arcpay.space/v1";

const ok = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SETUP: CustomerTransferCardSetup = {
  card_setup_id: SETUP_ID,
  status: "created",
  customer_reference: "expert-42",
  allowed_origin: "https://app.example.com",
  created_at: "2026-11-27T10:00:00Z",
  expires_at: "2026-11-27T10:30:00Z",
};

describe("server ArcPayClient customer transfer card setups", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: ArcPayClient;
  let windowDescriptor: PropertyDescriptor | undefined;
  let documentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    fetchMock = vi.fn().mockImplementation(async () => ok(SETUP));
    client = createArcPayClient({
      secretKey: "sk_test_fixture",
      apiBase: API,
      fetch: fetchMock as unknown as typeof fetch,
      retryDelayMs: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete (globalThis as { window?: unknown }).window;
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else delete (globalThis as { document?: unknown }).document;
  });

  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call]!;
    return {
      url: String(url),
      method: init.method as string,
      headers: init.headers as Record<string, string>,
      bodyText: init.body as string | undefined,
    };
  };

  it("creates a card setup with Idempotency-Key and only the contract fields", async () => {
    const body = {
      customer_reference: "expert-42",
      allowed_origin: "https://app.example.com",
      pan: "4111111111111111",
    } as CreateCustomerTransferCardSetupRequest;

    const setup = await client.createCustomerTransferCardSetup(body, {
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(setup).toEqual(SETUP);
    expect(sent()).toMatchObject({ url: `${API}/customer-transfer-card-setups`, method: "POST" });
    expect(sent().headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
    expect(JSON.parse(sent().bodyText!)).toEqual({
      customer_reference: "expert-42",
      allowed_origin: "https://app.example.com",
    });
  });

  it("refuses to create a card setup without a valid Idempotency-Key", async () => {
    const body = { customer_reference: "expert-42", allowed_origin: "https://app.example.com" };
    await expect(
      client.createCustomerTransferCardSetup(body, undefined as never),
    ).rejects.toMatchObject({ code: "missing_idempotency_key" });
    await expect(
      client.createCustomerTransferCardSetup(body, { idempotencyKey: "not-a-uuid" }),
    ).rejects.toMatchObject({ code: "invalid_idempotency_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a completed card setup with its card snapshot", async () => {
    const completed: CustomerTransferCardSetup = {
      ...SETUP,
      status: "completed",
      completed_at: "2026-11-27T10:05:00Z",
      card: {
        card_token_id: "0f8e2d6c-1111-4111-8111-111111111111",
        card_mask: "411111******1111",
        card_scheme: "visa",
        expires_at: "2027-11-27T10:05:00Z",
      },
    };
    fetchMock.mockImplementationOnce(async () => ok(completed));

    await expect(client.getCustomerTransferCardSetup(SETUP_ID)).resolves.toEqual(completed);
    expect(sent()).toMatchObject({
      url: `${API}/customer-transfer-card-setups/${SETUP_ID}`,
      method: "GET",
      bodyText: undefined,
    });
  });

  it("encodes the card setup id into the path and refuses a blank one", async () => {
    await client.getCustomerTransferCardSetup("a/b?c");
    expect(sent().url).toBe(`${API}/customer-transfer-card-setups/a%2Fb%3Fc`);
    await expect(client.getCustomerTransferCardSetup(" ")).rejects.toBeInstanceOf(ArcPayError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("issues a server card-entry ticket with only customer_reference", async () => {
    const ticket = {
      ticket: "tkt_server",
      card_entry_url: "https://cards.arcpay.space/v1/card-entry/disbursement-pan",
      expires_at: "2026-11-27T10:10:00Z",
      customer_reference: "expert-42",
    };
    fetchMock.mockImplementationOnce(async () => ok(ticket));

    await expect(
      client.createCustomerDisbursementCardEntryTicket({
        customer_reference: "expert-42",
        pan: "4111111111111111",
      } as { customer_reference: string }),
    ).resolves.toEqual(ticket);
    expect(sent()).toMatchObject({
      url: `${API}/customer-disbursements/card-entry-ticket`,
      method: "POST",
    });
    expect(JSON.parse(sent().bodyText!)).toEqual({ customer_reference: "expert-42" });
  });

  it("issues a server card-entry ticket without a body reference", async () => {
    fetchMock.mockImplementationOnce(async () =>
      ok({
        ticket: "t",
        card_entry_url: "https://cards.arcpay.space/v1/card-entry/disbursement-pan",
        expires_at: "2026-11-27T10:10:00Z",
        customer_reference: "anon-1",
      }),
    );
    await client.createCustomerDisbursementCardEntryTicket();
    expect(JSON.parse(sent().bodyText!)).toEqual({});
  });
});
