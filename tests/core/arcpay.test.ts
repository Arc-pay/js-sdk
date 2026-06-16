import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ArcPay } from "../../src/core/arcpay";

describe("ArcPay.load", () => {
  beforeEach(() => ArcPay.__resetForTests());
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns instance with environment populated", async () => {
    const inst = await ArcPay.load("pk_test_abc");
    expect(inst.publishableKey).toBe("pk_test_abc");
    expect(inst.environment).toBe("sandbox");
    expect("apiBase" in inst).toBe(false);
    expect("client" in inst).toBe(false);
  });

  it("passes hosted-fields appearance options into Elements", async () => {
    const inst = await ArcPay.load("pk_test_abc");
    const elements = inst.elements({
      appearance: {
        variables: {
          colorText: "#111827",
        },
      },
    });
    const field = elements.create("cardNumber");

    const container = document.createElement("div");
    document.body.appendChild(container);
    field.mount(container);
    const iframe = document.querySelector("iframe");
    if (!(iframe instanceof HTMLIFrameElement)) throw new Error("iframe was not mounted");
    const contentWindow = { postMessage: vi.fn() };
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      get: () => contentWindow,
    });

    const event = new MessageEvent("message", {
      data: { type: "arcpay:ready" },
      origin: "https://sdk.arcpay.space",
    });
    Object.defineProperty(event, "source", { value: contentWindow });
    window.dispatchEvent(event);

    expect(contentWindow.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:configure", field: "cardNumber", payload: { base: { color: "#111827" } } },
      "https://sdk.arcpay.space",
    );
    elements.destroy();
  });

  it("is idempotent for same key", async () => {
    const a = await ArcPay.load("pk_test_abc");
    const b = await ArcPay.load("pk_test_abc");
    expect(a).toBe(b);
  });

  it("returns different instances for different keys", async () => {
    const a = await ArcPay.load("pk_test_aaa");
    const b = await ArcPay.load("pk_test_bbb");
    expect(a).not.toBe(b);
  });

  it("throws on invalid key (sk_*)", async () => {
    await ArcPay.load("sk_test_x").then(
      () => {
        throw new Error("ArcPay.load should reject secret keys");
      },
      (err: unknown) => {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/publishable key/i);
      },
    );
  });
});
