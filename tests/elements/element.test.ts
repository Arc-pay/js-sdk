import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { Element } from "../../src/elements/element";
import type { ElementContext } from "../../src/elements/element";
import type { IframeToParent } from "../../src/elements/postmessage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IFRAME_BASE = "https://sdk.arcpay.space";
const IFRAME_ORIGIN = "https://sdk.arcpay.space";
const PK = "pk_test_abc123";
const CHANNEL_ID = "channel-test-123";

function makeContext(overrides: Partial<ElementContext> = {}): ElementContext {
  return {
    iframeBase: IFRAME_BASE,
    publishableKey: PK,
    channelId: CHANNEL_ID,
    ...overrides,
  };
}

function getIframe(): HTMLIFrameElement {
  const el = document.querySelector("iframe");
  if (!el) throw new Error("No iframe found in DOM");
  return el as HTMLIFrameElement;
}

/**
 * jsdom does not populate contentWindow on iframes that are appended to the
 * document body (it only does so for fully navigated frames). We patch
 * contentWindow with a mock so postToIframe doesn't throw.
 */
function mockIframeContentWindow(iframe: HTMLIFrameElement): {
  postMessage: ReturnType<typeof vi.fn>;
} {
  const mock = { postMessage: vi.fn() };
  Object.defineProperty(iframe, "contentWindow", {
    configurable: true,
    get: () => mock,
  });
  return mock;
}

/**
 * Dispatch a message that appears to originate from the given iframe's
 * contentWindow. The Element message handler uses event.source to filter
 * messages to only the matching iframe (C1 fix). jsdom's MessageEvent
 * constructor does not set event.source automatically, so we patch it
 * via Object.defineProperty after construction.
 *
 * jsdom limitation: iframes appended to the DOM don't have a real
 * contentWindow unless navigated; we work around this by patching
 * contentWindow with mockIframeContentWindow first, then dispatching
 * with source set to that same mock value.
 */
function dispatchFromIframe(data: IframeToParent, source?: object | null): void {
  const event = new MessageEvent("message", { data, origin: IFRAME_ORIGIN });
  if (source !== undefined) {
    Object.defineProperty(event, "source", { value: source });
  }
  window.dispatchEvent(event);
}

function dispatchFromOrigin(data: unknown, origin: string): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Element.mount", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "card-container";
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("creates an iframe with the correct src when mounted via HTMLElement", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    expect(iframe.src).toBe(`${IFRAME_BASE}/iframe/cardNumber`);
    el.destroy();
  });

  it("creates an iframe with the correct src when mounted via CSS selector", () => {
    const el = new Element("cardExpiry", {}, makeContext());
    el.mount("#card-container");

    const iframe = getIframe();
    expect(iframe.src).toBe(`${IFRAME_BASE}/iframe/cardExpiry`);
    el.destroy();
  });

  it("sets allow=payment and data-arcpay-element attributes", () => {
    const el = new Element("cardCvv", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    expect(iframe.getAttribute("allow")).toBe("payment");
    expect(iframe.getAttribute("data-arcpay-element")).toBe("cardCvv");
    expect(iframe.getAttribute("title")).toBe("Arc Pay card security code");
    expect(iframe.getAttribute("aria-label")).toBe("Arc Pay card security code");
    el.destroy();
  });

  it("sends arcpay:hello to the iframe on load", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    iframe.dispatchEvent(new Event("load"));

    expect(cw.postMessage).toHaveBeenCalledOnce();
    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:hello", publishableKey: PK, channelId: CHANNEL_ID }),
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("throws ArcPayError(already_mounted) when mount is called twice", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const tryMount = () => el.mount(container);
    expect(tryMount).toThrowError(ArcPayError);
    const err = (() => {
      try {
        el.mount(container);
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err.code).toBe("already_mounted");
    el.destroy();
  });

  it("throws ArcPayError(mount_target_not_found) when selector matches nothing", () => {
    const el = new Element("cardNumber", {}, makeContext());
    const tryMount = () => el.mount("#does-not-exist");
    expect(tryMount).toThrowError(ArcPayError);
    const err = (() => {
      try {
        el.mount("#does-not-exist");
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err.code).toBe("mount_target_not_found");
  });
});

// ---------------------------------------------------------------------------

describe("Element events — arcpay:ready", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("emits ready once after iframe confirms configuration", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const listener = vi.fn();
    el.on("ready", listener);

    expect(el.isReady()).toBe(false);
    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    expect(listener).not.toHaveBeenCalled();
    expect(el.isReady()).toBe(false);

    dispatchFromIframe({ type: "arcpay:configured" }, cw);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "ready", field: "cardNumber" });
    expect(el.isReady()).toBe(true);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    dispatchFromIframe({ type: "arcpay:configured" }, cw);
    expect(listener).toHaveBeenCalledOnce();
    el.destroy();
  });

  it("emits error event on arcpay:rejected", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const listener = vi.fn();
    el.on("error", listener);

    dispatchFromIframe(
      {
        type: "arcpay:rejected",
        reason: "domain not authorized",
        code: "origin_not_allowed",
        retryable: false,
      },
      cw,
    );

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      type: "error",
      field: "cardNumber",
      code: "origin_not_allowed",
      reason: "domain not authorized",
      retryable: false,
    });
    expect(el.isReady()).toBe(false);
    el.destroy();
  });

  it("delivers events only to listeners registered for that event name", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const ready = vi.fn();
    const change = vi.fn();
    const error = vi.fn();
    el.on("ready", ready);
    el.on("change", change);
    el.on("error", error);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    dispatchFromIframe({ type: "arcpay:configured" }, cw);
    expect(ready).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "cardNumber",
        isValid: true,
        isEmpty: false,
        isComplete: true,
        issue: null,
        help: { code: "enter_card_number", message: "Enter the card number" },
      },
      cw,
    );
    expect(change).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();

    dispatchFromIframe(
      { type: "arcpay:rejected", reason: "domain not authorized", code: "origin_not_allowed" },
      cw,
    );
    expect(error).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
    el.destroy();
  });
});

// ---------------------------------------------------------------------------

describe("Element events — arcpay:change", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("emits change event when field matches", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const listener = vi.fn();
    el.on("change", listener);

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "cardNumber",
        isValid: true,
        isEmpty: false,
        isComplete: true,
        brand: "visa",
        lastFour: "1234",
        issue: null,
        help: { code: "card_brand_detected", message: "Card brand detected", brand: "visa" },
      },
      cw,
    );

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      type: "change",
      field: "cardNumber",
      isValid: true,
      isEmpty: false,
      isComplete: true,
      brand: "visa",
      lastFour: "1234",
      issue: null,
      help: { code: "card_brand_detected", message: "Card brand detected", brand: "visa" },
    });
    el.destroy();
  });

  it("ignores arcpay:change for a different field", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const listener = vi.fn();
    el.on("change", listener);

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "cardExpiry",
        isValid: false,
        isEmpty: false,
        isComplete: false,
        issue: {
          code: "card_expiry_incomplete",
          message: "Enter the full expiry date",
          severity: "error",
        },
        help: { code: "enter_card_expiry", message: "Enter the expiry date" },
      },
      cw,
    );

    expect(listener).not.toHaveBeenCalled();
    el.destroy();
  });

  it("unsubscribes listener when the returned function is called", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    const listener = vi.fn();
    const off = el.on("change", listener);
    off();

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "cardNumber",
        isValid: true,
        isEmpty: false,
        isComplete: true,
        issue: null,
        help: { code: "enter_card_number", message: "Enter the card number" },
      },
      cw,
    );

    expect(listener).not.toHaveBeenCalled();
    el.destroy();
  });
});

// ---------------------------------------------------------------------------

describe("Element appearance", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("sends normalized appearance to the iframe after ready", () => {
    const el = new Element(
      "cardNumber",
      {
        appearance: {
          variables: {
            fontFamily: "Inter, system-ui, sans-serif",
            colorText: "#111827",
            colorPlaceholder: "#9ca3af",
          },
          rules: {
            base: { border: "1px solid red" },
            focus: { "font-weight": "600" },
          },
        },
      },
      makeContext(),
    );
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);

    expect(cw.postMessage).toHaveBeenCalledWith(
      {
        type: "arcpay:configure",
        field: "cardNumber",
        payload: {
          base: {
            "font-family": "Inter, system-ui, sans-serif",
            color: "#111827",
            "--arcpay-placeholder-color": "#9ca3af",
          },
          focus: { "font-weight": "600" },
        },
      },
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("initial configuration preserves an explicit empty placeholder", () => {
    const el = new Element("cardNumber", { placeholder: "" }, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);

    expect(cw.postMessage).toHaveBeenCalledWith(
      {
        type: "arcpay:configure",
        field: "cardNumber",
        payload: { base: {} },
        placeholder: "",
      },
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("update() sends normalized appearance without accepting container CSS", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    el.update({
      appearance: {
        rules: {
          base: {
            color: "#0f172a",
            padding: "12px",
            "box-shadow": "0 0 0 1px red",
          },
        },
      },
    });

    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:style", payload: { base: { color: "#0f172a" } } },
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("update() can clear placeholder explicitly", () => {
    const el = new Element("cardNumber", { placeholder: "PAN" }, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    el.update({ placeholder: "" });

    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:placeholder", field: "cardNumber", placeholder: "" },
      IFRAME_ORIGIN,
    );
    el.destroy();
  });
});

// ---------------------------------------------------------------------------

describe("Element origin guard", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("ignores postMessages from wrong origin", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    mockIframeContentWindow(getIframe());

    const listener = vi.fn();
    el.on("ready", listener);

    dispatchFromOrigin({ type: "arcpay:ready" }, "https://evil.example.com");

    expect(listener).not.toHaveBeenCalled();
    el.destroy();
  });

  // C1: source guard — messages from a different iframe at the same origin
  // (e.g. cardExpiry or cardCvv) must not trigger this element's handler.
  // jsdom does not set event.source automatically, so we simulate a message
  // from a *different* contentWindow mock to verify the guard works.
  it("ignores postMessages from a different iframe at the same origin (C1 source guard)", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    // Patch this element's iframe with a mock contentWindow.
    mockIframeContentWindow(getIframe());

    const listener = vi.fn();
    el.on("ready", listener);

    // Simulate a message whose source is a *different* contentWindow.
    const otherWindow = { postMessage: vi.fn() };
    const event = new MessageEvent("message", {
      data: { type: "arcpay:ready" },
      origin: IFRAME_ORIGIN,
    });
    Object.defineProperty(event, "source", { value: otherWindow });
    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    el.destroy();
  });
});

// ---------------------------------------------------------------------------

describe("Element.destroy", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("removes the iframe from the DOM and stops emitting events", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    expect(document.querySelector("iframe")).not.toBeNull();

    const listener = vi.fn();
    el.on("ready", listener);

    el.destroy();

    expect(document.querySelector("iframe")).toBeNull();

    // Events dispatched after destroy should not reach the listener.
    // Source is the mock from before destroy; handler is removed at destroy time.
    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    expect(listener).not.toHaveBeenCalled();
  });

  it("isReady() returns false after destroy even if it was ready before", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    dispatchFromIframe({ type: "arcpay:configured" }, cw);
    expect(el.isReady()).toBe(true);

    el.destroy();
    expect(el.isReady()).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("Element.send / focus / clear", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("send() throws ArcPayError(not_mounted) before mount", () => {
    const el = new Element("cardNumber", {}, makeContext());
    const trySend = () => el.send({ type: "arcpay:focus" });
    expect(trySend).toThrowError(ArcPayError);
    const err = (() => {
      try {
        el.send({ type: "arcpay:focus" });
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err.code).toBe("not_mounted");
  });

  it("focus() sends arcpay:focus to the iframe", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    el.focus();

    expect(cw.postMessage).toHaveBeenCalledOnce();
    expect(cw.postMessage).toHaveBeenCalledWith({ type: "arcpay:focus" }, IFRAME_ORIGIN);
    el.destroy();
  });

  it("clear() sends arcpay:clear to the iframe", () => {
    const el = new Element("cardNumber", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    el.clear();

    expect(cw.postMessage).toHaveBeenCalledOnce();
    expect(cw.postMessage).toHaveBeenCalledWith({ type: "arcpay:clear" }, IFRAME_ORIGIN);
    el.destroy();
  });
});
