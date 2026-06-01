import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { Elements } from "../../src/elements/elements";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// In jsdom window.location.origin is "http://localhost". We use that as both
// the parent origin and the iframeBase so origin-matching works without
// configuring a custom domain.
const IFRAME_BASE = "http://localhost";
const IFRAME_ORIGIN = "http://localhost";
const PK = "pk_test_elements";

function makeElements(iframeBase = IFRAME_BASE): Elements {
  return new Elements({ publishableKey: PK, iframeBase });
}

/**
 * jsdom doesn't populate contentWindow on appended iframes.
 * Patch every iframe in the DOM with a mock after mount and return the mock
 * objects so tests can use them as event.source.
 */
function mockAllIframeContentWindows(): Array<{ postMessage: ReturnType<typeof vi.fn> }> {
  const mocks: Array<{ postMessage: ReturnType<typeof vi.fn> }> = [];
  for (const iframe of document.querySelectorAll("iframe")) {
    const mock = { postMessage: vi.fn() };
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      get: () => mock,
    });
    mocks.push(mock);
  }
  return mocks;
}

/**
 * Dispatch a message that appears to come from the iframe at the given index
 * in the DOM. The Element message handler checks event.source (C1 fix), so we
 * must set source to the matching contentWindow mock.
 *
 * jsdom limitation: MessageEvent constructor does not set event.source. We
 * patch it via Object.defineProperty after construction.
 */
function dispatchFromIframe(data: unknown, source?: object | null): void {
  const event = new MessageEvent("message", { data, origin: IFRAME_ORIGIN });
  if (source !== undefined) {
    Object.defineProperty(event, "source", { value: source });
  }
  window.dispatchEvent(event);
}

function makeMountDivs(): { cn: HTMLDivElement; ce: HTMLDivElement; cv: HTMLDivElement } {
  const cn = document.createElement("div");
  const ce = document.createElement("div");
  const cv = document.createElement("div");
  document.body.replaceChildren(cn, ce, cv);
  return { cn, ce, cv };
}

function mountAll(
  els: Elements,
  { cn, ce, cv }: { cn: HTMLElement; ce: HTMLElement; cv: HTMLElement },
) {
  const cardNumber = els.create("cardNumber");
  const cardExpiry = els.create("cardExpiry");
  const cardCvv = els.create("cardCvv");
  cardNumber.mount(cn);
  cardExpiry.mount(ce);
  cardCvv.mount(cv);
  return { cardNumber, cardExpiry, cardCvv };
}

/**
 * Simulate iframe load + arcpay:ready for all iframes (handshake complete).
 * Each arcpay:ready is dispatched with source = the iframe's own contentWindow
 * so the C1 source-guard in Element.messageHandler accepts it.
 */
function simulateAllReady(): void {
  const iframes = Array.from(document.querySelectorAll("iframe"));
  for (const iframe of iframes) {
    iframe.dispatchEvent(new Event("load"));
  }
  // Each iframe sends arcpay:ready after handshake, then confirms configuration.
  for (const iframe of iframes) {
    const cw = (iframe as HTMLIFrameElement).contentWindow;
    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    dispatchFromIframe({ type: "arcpay:configured" }, cw);
  }
}

// ---------------------------------------------------------------------------
// Elements.create
// ---------------------------------------------------------------------------

describe("Elements.create", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns an Element instance for each field", () => {
    const els = makeElements();
    const divs = makeMountDivs();
    const { cardNumber, cardExpiry, cardCvv } = mountAll(els, divs);
    expect(cardNumber.field).toBe("cardNumber");
    expect(cardExpiry.field).toBe("cardExpiry");
    expect(cardCvv.field).toBe("cardCvv");
    els.destroy();
  });

  it("throws ArcPayError(duplicate_element) when the same field is created twice", () => {
    const els = makeElements();
    els.create("cardNumber");
    const tryCreate = () => els.create("cardNumber");
    expect(tryCreate).toThrowError(ArcPayError);
    const err = (() => {
      try {
        els.create("cardNumber");
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err.code).toBe("duplicate_element");
    els.destroy();
  });

  it("applies factory appearance to created elements unless an element overrides it", () => {
    const els = new Elements({
      publishableKey: PK,
      iframeBase: IFRAME_BASE,
      appearance: {
        variables: {
          colorText: "#111827",
        },
      },
    });
    const divs = makeMountDivs();
    const cardNumber = els.create("cardNumber");
    const cardExpiry = els.create("cardExpiry", {
      appearance: {
        variables: {
          colorText: "#0f766e",
        },
      },
    });

    cardNumber.mount(divs.cn);
    cardExpiry.mount(divs.ce);
    const mocks = mockAllIframeContentWindows();

    dispatchFromIframe({ type: "arcpay:ready" }, mocks[0]);
    dispatchFromIframe({ type: "arcpay:ready" }, mocks[1]);

    expect(mocks[0].postMessage).toHaveBeenCalledWith(
      { type: "arcpay:configure", field: "cardNumber", payload: { base: { color: "#111827" } } },
      IFRAME_ORIGIN,
    );
    expect(mocks[1].postMessage).toHaveBeenCalledWith(
      { type: "arcpay:configure", field: "cardExpiry", payload: { base: { color: "#0f766e" } } },
      IFRAME_ORIGIN,
    );
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.tokenize — validation guards
// ---------------------------------------------------------------------------

describe("Elements.tokenize — validation guards", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("rejects with ArcPayError(incomplete_elements) when no elements created", async () => {
    const els = makeElements();
    await expect(els.tokenize("pay_x", "uuid-1")).rejects.toThrowError(ArcPayError);
    const err = (await els.tokenize("pay_x", "uuid-2").catch((e: unknown) => e)) as ArcPayError;
    expect(err.code).toBe("incomplete_elements");
    els.destroy();
  });

  it("rejects with ArcPayError(incomplete_elements) when only two elements created", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    els.create("cardNumber").mount(divs.cn);
    els.create("cardExpiry").mount(divs.ce);

    const err = (await els.tokenize("pay_x", "uuid-3").catch((e: unknown) => e)) as ArcPayError;
    expect(err.code).toBe("incomplete_elements");
    els.destroy();
  });

  it("rejects with ArcPayError(elements_not_ready) when elements are mounted but not yet ready", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    // No arcpay:ready dispatched — elements stay in "pending" status

    const err = (await els.tokenize("pay_x", "uuid-4").catch((e: unknown) => e)) as ArcPayError;
    expect(err.code).toBe("elements_not_ready");
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.tokenize — happy path
// ---------------------------------------------------------------------------

describe("Elements.tokenize — happy path", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("sends arcpay:tokenize to cardNumber iframe and resolves on arcpay:tokenize-result", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);

    // Patch contentWindow mocks before simulating load (load triggers hello send).
    // mockAllIframeContentWindows returns mocks in DOM order: [cardNumber, cardExpiry, cardCvv].
    mockAllIframeContentWindows();
    simulateAllReady();

    // Patch again after ready (mocks persist; re-patching ensures same mock reference).
    const mocks = mockAllIframeContentWindows();
    // cardNumber is the first iframe mounted (index 0).
    const cardNumberMock = mocks[0];

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-1");

    // The promise sends arcpay:tokenize to cardNumber iframe (index 0).
    expect(cardNumberMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:tokenize" }),
      IFRAME_ORIGIN,
    );

    // Simulate the cardNumber iframe responding with tokenize-result.
    // Source must match cardNumber's contentWindow for the C1 source guard.
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
      cardNumberMock,
    );

    const result = await tokenizePromise;
    expect(result.cardTokenId).toBe("tok_abc");
    expect(result.cardMask).toBe("427600****1234");
    expect(result.cardScheme).toBe("visa");
    expect(result.cardBin).toBe("427600");
    expect(result.expiresIn).toBe(300);
    expect(result.expiresAt).toBe("2028-12-31T23:59:59Z");
    els.destroy();
  });

  it("rejects on arcpay:tokenize-error with ArcPayError containing the code + message", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-2");

    dispatchFromIframe(
      {
        type: "arcpay:tokenize-error",
        errorType: "api_error",
        code: "card_declined",
        message: "Card was declined",
      },
      cardNumberMock,
    );

    const err = (await tokenizePromise.catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.type).toBe("api_error");
    expect(err.code).toBe("card_declined");
    expect(err.message).toBe("Card was declined");
    expect(err.paymentId).toBe("pay_abc");
    els.destroy();
  });

  it("ignores tokenize messages from wrong origin", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];

    const tokenizePromise = els.tokenize("pay_abc", "idem-key-3");

    // Wrong origin — should be ignored (no source set; won't pass origin check either).
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

    // Now send from correct origin and correct source.
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
      cardNumberMock,
    );

    const result = await tokenizePromise;
    expect(result.cardTokenId).toBe("tok_real");
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.tokenize — C1 source guard
// ---------------------------------------------------------------------------

describe("Elements.tokenize — C1 source guard", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("ignores tokenize-result from a different iframe at the same origin", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];
    // A *different* window (e.g. cardExpiry iframe) at the same origin.
    const cardExpiryMock = mocks[1];

    const tokenizePromise = els.tokenize("pay_src", "idem-src-1");

    // Message from cardExpiry's contentWindow — same origin, wrong source.
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_wrong_source",
        cardMask: "...",
        cardScheme: "visa",
        cardBin: "000000",
        expiresIn: 300,
        expiresAt: "2030-01-01T00:00:00Z",
      },
      cardExpiryMock,
    );

    // Now the real message from cardNumber's contentWindow.
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_correct",
        cardMask: "427600****9999",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2029-06-30T23:59:59Z",
      },
      cardNumberMock,
    );

    const result = await tokenizePromise;
    expect(result.cardTokenId).toBe("tok_correct");
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.tokenize — C2 concurrent-call guard
// ---------------------------------------------------------------------------

describe("Elements.tokenize — C2 concurrent-call guard", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("rejects second concurrent tokenize() with tokenize_in_progress", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];

    // First call — start but don't await yet.
    const first = els.tokenize("pay_c2a", "idem-c2-1");

    // Second call — must reject immediately with tokenize_in_progress.
    const err = (await els
      .tokenize("pay_c2b", "idem-c2-2")
      .catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("tokenize_in_progress");

    // Resolve the first promise before awaiting it (avoids hitting the 30s timer).
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
      cardNumberMock,
    );
    await first;
    els.destroy();
  });

  it("allows a second tokenize() after the first resolves", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];

    const first = els.tokenize("pay_c2c", "idem-c2-3");
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_first",
        cardMask: "...",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2030-01-01T00:00:00Z",
      },
      cardNumberMock,
    );
    await first;

    // After first resolved, in-flight flag cleared — second call must succeed.
    const second = els.tokenize("pay_c2d", "idem-c2-4");
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_second",
        cardMask: "427600****0001",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2031-01-01T00:00:00Z",
      },
      cardNumberMock,
    );
    const result = await second;
    expect(result.cardTokenId).toBe("tok_second");
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.tokenize — C3 30-second timeout
// ---------------------------------------------------------------------------

describe("Elements.tokenize — C3 30-second timeout", () => {
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
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();
    mockAllIframeContentWindows();

    const tokenizePromise = els.tokenize("pay_timeout", "idem-timeout-1");

    // Advance fake timers past 30 seconds.
    vi.advanceTimersByTime(30_001);

    const err = (await tokenizePromise.catch((e: unknown) => e)) as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("tokenize_timeout");
    expect(err.type).toBe("network_error");
    expect(err.retryable).toBe(true);
    expect(err.paymentId).toBe("pay_timeout");
    els.destroy();
  });

  it("does not reject before 30 seconds have elapsed", async () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);
    mockAllIframeContentWindows();
    simulateAllReady();

    const mocks = mockAllIframeContentWindows();
    const cardNumberMock = mocks[0];

    const tokenizePromise = els.tokenize("pay_notimeout", "idem-timeout-2");

    // Advance to just before the timeout fires.
    vi.advanceTimersByTime(29_999);

    // Respond before timeout — should resolve normally.
    dispatchFromIframe(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_before_timeout",
        cardMask: "427600****0001",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: 300,
        expiresAt: "2030-01-01T00:00:00Z",
      },
      cardNumberMock,
    );

    const result = await tokenizePromise;
    expect(result.cardTokenId).toBe("tok_before_timeout");
    els.destroy();
  });
});

// ---------------------------------------------------------------------------
// Elements.destroy
// ---------------------------------------------------------------------------

describe("Elements.destroy", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("removes all iframes from the DOM", () => {
    const els = makeElements();
    const divs = makeMountDivs();
    mountAll(els, divs);

    expect(document.querySelectorAll("iframe")).toHaveLength(3);
    els.destroy();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });
});
