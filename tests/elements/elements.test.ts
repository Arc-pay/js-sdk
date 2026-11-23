import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { Elements } from "../../src/elements/elements";

const IFRAME_BASE = "https://localhost";
const IFRAME_ORIGIN = "https://localhost";
const PK = "pk_test_elements";

function channelIdFromMock(source: object): string {
  const calls = (source as { postMessage?: { mock?: { calls?: unknown[][] } } }).postMessage?.mock
    ?.calls;
  for (const call of calls ?? []) {
    const message = call[0] as { type?: string; channelId?: string };
    if (message.type === "arcpay:hello" && typeof message.channelId === "string") {
      return message.channelId;
    }
  }
  throw new Error("No arcpay:hello channelId found");
}

function makeElements(iframeBase = IFRAME_BASE): Elements {
  return new Elements({ publishableKey: PK, iframeBase });
}

function channelIdFromElements(elements: Elements): string {
  return (elements as unknown as { channelId: string }).channelId;
}

function mockIframeContentWindow(selector = "iframe"): { postMessage: ReturnType<typeof vi.fn> } {
  const iframe = document.querySelector(selector) as HTMLIFrameElement | null;
  if (!iframe) throw new Error("No iframe found");
  const mock = { postMessage: vi.fn() };
  Object.defineProperty(iframe, "contentWindow", {
    configurable: true,
    get: () => mock,
  });
  return mock;
}

function dispatchFromIframe(
  data: Record<string, unknown>,
  source?: object | null,
  channelId?: string,
): void {
  const routedData =
    source && typeof source === "object"
      ? {
          field: data.field ?? "card",
          channelId: data.channelId ?? channelId ?? channelIdFromMock(source),
          ...data,
        }
      : data;
  const event = new MessageEvent("message", { data: routedData, origin: IFRAME_ORIGIN });
  if (source !== undefined) {
    Object.defineProperty(event, "source", { value: source });
  }
  window.dispatchEvent(event);
}

function mountCard(els: Elements): HTMLElement {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  els.create("card").mount(container);
  return container;
}

function mountSplitCard(els: Elements): HTMLElement {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  for (const field of ["cardNumber", "cardExpiry", "cardCvv"] as const) {
    const target = document.createElement("div");
    target.id = field;
    container.appendChild(target);
    els.create(field).mount(target);
  }
  return container;
}

function simulateReady(elements: Elements, source: object, field = "card"): void {
  document.querySelector(`[data-arcpay-element="${field}"]`)?.dispatchEvent(new Event("load"));
  dispatchFromIframe({ type: "arcpay:ready", field }, source, channelIdFromElements(elements));
  dispatchFromIframe({ type: "arcpay:configured", field }, source, channelIdFromElements(elements));
}

describe("Elements.create", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns one secure card Element", () => {
    const els = makeElements();
    const container = document.createElement("div");
    document.body.replaceChildren(container);

    const card = els.create("card");
    card.mount(container);

    expect(card.field).toBe("card");
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    els.destroy();
  });

  it("returns split secure card Elements for flexible merchant layouts", () => {
    const els = makeElements();
    mountSplitCard(els);

    expect(document.querySelectorAll("iframe")).toHaveLength(3);
    expect(document.querySelector('[data-arcpay-element="cardNumber"]')).toBeInstanceOf(
      HTMLIFrameElement,
    );
    expect(document.querySelector('[data-arcpay-element="cardExpiry"]')).toBeInstanceOf(
      HTMLIFrameElement,
    );
    expect(document.querySelector('[data-arcpay-element="cardCvv"]')).toBeInstanceOf(
      HTMLIFrameElement,
    );
    els.destroy();
  });

  it("rejects mixing composite and split Hosted Fields modes", () => {
    const els = makeElements();
    els.create("card");
    expect(() => els.create("cardNumber")).toThrowError(ArcPayError);
    els.destroy();

    const split = makeElements();
    split.create("cardNumber");
    expect(() => split.create("card")).toThrowError(ArcPayError);
    split.destroy();
  });

  it("throws ArcPayError(duplicate_element) when the card field is created twice", () => {
    const els = makeElements();
    els.create("card");
    const err = (() => {
      try {
        els.create("card");
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("duplicate_element");
    els.destroy();
  });

  it("applies factory appearance to the card element unless overridden", () => {
    const els = new Elements({
      publishableKey: PK,
      iframeBase: IFRAME_BASE,
      appearance: { variables: { colorText: "#111827" } },
    });
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    const card = els.create("card", {
      appearance: { variables: { colorText: "#0f766e" } },
    });
    card.mount(container);
    const mock = mockIframeContentWindow();

    simulateReady(els, mock);

    expect(mock.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:configure", field: "card", payload: { base: { color: "#0f766e" } } },
      IFRAME_ORIGIN,
    );
    els.destroy();
  });
});

describe("Elements.tokenize validation guards", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("rejects with ArcPayError(incomplete_elements) when no card element is created", async () => {
    const els = makeElements();
    const err = (await els.tokenize("pay_x", "uuid-1").catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("incomplete_elements");
    els.destroy();
  });

  it("rejects missing tokenize identifiers before sending iframe commands", async () => {
    const els = makeElements();
    await expect(els.tokenize("", "idem-key")).rejects.toMatchObject({
      code: "missing_payment_id",
    });
    await expect(els.tokenize("pay_1", "")).rejects.toMatchObject({
      code: "missing_idempotency_key",
    });
    els.destroy();
  });

  it("rejects with ArcPayError(elements_not_ready) when card is mounted but not ready", async () => {
    const els = makeElements();
    mountCard(els);

    const err = (await els.tokenize("pay_x", "uuid-2").catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("elements_not_ready");
    els.destroy();
  });

  it("requires all split Hosted Fields before tokenize()", async () => {
    const els = makeElements();
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    els.create("cardNumber").mount(container);
    const cardNumberMock = mockIframeContentWindow();
    simulateReady(els, cardNumberMock, "cardNumber");

    const err = (await els.tokenize("pay_x", "uuid-3").catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("incomplete_elements");
    els.destroy();
  });
});

describe("Elements.tokenize", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("sends arcpay:tokenize to the card iframe and resolves on arcpay:tokenize-result", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-1");

    expect(cardMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:tokenize" }),
      IFRAME_ORIGIN,
    );

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_abc",
        cardMask: "427600****1234",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2028-12-31T23:59:59Z",
      },
      cardMock,
    );

    await expect(tokenizePromise).resolves.toMatchObject({ cardTokenId: "tok_abc" });
    els.destroy();
  });

  it("sends arcpay:tokenize to cardNumber when using split Hosted Fields", async () => {
    const els = makeElements();
    mountSplitCard(els);
    const cardNumberMock = mockIframeContentWindow('[data-arcpay-element="cardNumber"]');
    const cardExpiryMock = mockIframeContentWindow('[data-arcpay-element="cardExpiry"]');
    const cardCvvMock = mockIframeContentWindow('[data-arcpay-element="cardCvv"]');
    simulateReady(els, cardNumberMock, "cardNumber");
    simulateReady(els, cardExpiryMock, "cardExpiry");
    simulateReady(els, cardCvvMock, "cardCvv");

    const tokenizePromise = els.tokenize("pay_split", "idem-split-1");

    for (const target of [cardNumberMock, cardExpiryMock, cardCvvMock]) {
      expect(
        target.postMessage.mock.calls.some(
          ([message]) => message.type === "arcpay:split-value-port",
        ),
      ).toBe(false);
    }
    expect(cardNumberMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:tokenize" }),
      IFRAME_ORIGIN,
    );
    expect(cardExpiryMock.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:tokenize" }),
      IFRAME_ORIGIN,
    );
    expect(cardCvvMock.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:tokenize" }),
      IFRAME_ORIGIN,
    );

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_split",
        cardMask: "427600****1234",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2028-12-31T23:59:59Z",
      },
      cardNumberMock,
    );

    await expect(tokenizePromise).resolves.toMatchObject({ cardTokenId: "tok_split" });
    els.destroy();
  });

  it("rejects on arcpay:tokenize-error with ArcPayError containing the code and message", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-2");
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-error",
        errorType: "api_error",
        code: "card_declined",
        message: "Card was declined",
      },
      cardMock,
    );

    const err = (await tokenizePromise.catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.type).toBe("api_error");
    expect(err.code).toBe("card_declined");
    expect(err.message).toBe("Card was declined");
    expect(err.paymentId).toBe("pay_abc");
    els.destroy();
  });

  it("ignores tokenize messages from wrong origin or wrong source", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-3");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "arcpay:tokenize-result",
          cardTokenId: "tok_evil",
          cardMask: "...",
          cardScheme: "visa",
          cardBin: "000000",
          expiresIn: 300,
          expiresAt: "2030-01-01T00:00:00Z",
        },
        origin: "https://evil.example.com",
      }),
    );

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        channelId: channelIdFromElements(els),
        cardTokenId: "tok_wrong_source",
        cardMask: "...",
        cardScheme: "visa",
        cardBin: "000000",
        expiresIn: 300,
        expiresAt: "2030-01-01T00:00:00Z",
      },
      { postMessage: vi.fn() },
    );

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_real",
        cardMask: "427600****5678",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2029-06-30T23:59:59Z",
      },
      cardMock,
    );

    await expect(tokenizePromise).resolves.toMatchObject({ cardTokenId: "tok_real" });
    els.destroy();
  });

  it("fails closed when the card iframe contentWindow is unavailable", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);
    Object.defineProperty(document.querySelector("iframe") as HTMLIFrameElement, "contentWindow", {
      configurable: true,
      get: () => null,
    });

    const err = (await els.tokenize("pay_src", "idem-src").catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.type).toBe("validation_error");
    expect(err.code).toBe("iframe_not_loaded");
    expect(err.paymentId).toBe("pay_src");
    els.destroy();
  });

  it("rejects second concurrent tokenize() with tokenize_in_progress", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);

    const first = els.tokenize("pay_c2a", "idem-c2-1");
    const err = (await els
      .tokenize("pay_c2b", "idem-c2-2")
      .catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("tokenize_in_progress");

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_c2",
        cardMask: "...",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2030-01-01T00:00:00Z",
      },
      cardMock,
    );
    await first;
    els.destroy();
  });
});

describe("Elements.tokenize timeout", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects with tokenize_timeout if no result arrives within 30 seconds", async () => {
    const els = makeElements();
    mountCard(els);
    const cardMock = mockIframeContentWindow();
    simulateReady(els, cardMock);

    const tokenizePromise = els.tokenize("pay_timeout", "idem-timeout-1");
    vi.advanceTimersByTime(30_001);

    const err = (await tokenizePromise.catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("tokenize_timeout");
    expect(err.type).toBe("network_error");
    expect(err.retryable).toBe(true);
    expect(err.paymentId).toBe("pay_timeout");
    els.destroy();
  });
});

describe("Elements.destroy", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("removes all iframes from the DOM", () => {
    const els = makeElements();
    mountCard(els);

    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    els.destroy();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });
});
