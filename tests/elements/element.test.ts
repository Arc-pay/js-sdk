import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { Element, type ElementContext } from "../../src/elements/element";
import type { IframeToParent } from "../../src/elements/postmessage";

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

function dispatchFromIframe(data: IframeToParent, source?: object | null): void {
  const event = new MessageEvent("message", { data, origin: IFRAME_ORIGIN });
  if (source !== undefined) {
    Object.defineProperty(event, "source", { value: source });
  }
  window.dispatchEvent(event);
}

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

  it("creates a secure card iframe when mounted via HTMLElement or selector", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);

    const iframe = getIframe();
    expect(iframe.src).toBe(
      `${IFRAME_BASE}/iframe/card?parent_origin=http%3A%2F%2Flocalhost%3A3000&publishable_key=${PK}`,
    );
    expect(iframe.getAttribute("allow")).toBe("payment");
    expect(iframe.getAttribute("data-arcpay-element")).toBe("card");
    expect(iframe.getAttribute("title")).toBe("Arc Pay secure card details");
    expect(iframe.getAttribute("aria-label")).toBe("Arc Pay secure card details");
    expect(iframe.style.minHeight).toBe("44px");
    el.destroy();
  });

  it("binds merchant-owned labels and descriptions to the secure iframe", () => {
    const el = new Element(
      "card",
      { label: "Card number", describedBy: "card-help card-error" },
      makeContext(),
    );
    el.mount(container);

    const iframe = getIframe();
    expect(container.getAttribute("role")).toBe("group");
    expect(container.getAttribute("aria-label")).toBe("Card number");
    expect(container.getAttribute("aria-describedby")).toBe("card-help card-error");
    expect(iframe.getAttribute("title")).toBe("Card number");
    expect(iframe.getAttribute("aria-label")).toBe("Card number");
    expect(iframe.getAttribute("aria-describedby")).toBe("card-help card-error");
    el.destroy();
  });

  it("updates accessible iframe metadata without remounting", () => {
    const el = new Element(
      "card",
      { label: "Card number", describedBy: "card-help" },
      makeContext(),
    );
    el.mount(container);

    const iframe = getIframe();
    el.update({ label: "Secure card details", describedBy: "card-error" });

    expect(getIframe()).toBe(iframe);
    expect(iframe.getAttribute("title")).toBe("Secure card details");
    expect(iframe.getAttribute("aria-label")).toBe("Secure card details");
    expect(iframe.getAttribute("aria-describedby")).toBe("card-error");

    el.update({ describedBy: "" });
    expect(iframe.hasAttribute("aria-describedby")).toBe(false);
    el.destroy();
  });

  it("sends arcpay:hello to the iframe on load", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const iframe = getIframe();
    const cw = mockIframeContentWindow(iframe);

    iframe.dispatchEvent(new Event("load"));

    expect(cw.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "arcpay:hello", publishableKey: PK, channelId: CHANNEL_ID }),
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("throws ArcPayError for duplicate mount and missing target", () => {
    const mounted = new Element("card", {}, makeContext());
    mounted.mount(container);
    expect(() => mounted.mount(container)).toThrowError(ArcPayError);

    const missing = new Element("card", {}, makeContext());
    const err = (() => {
      try {
        missing.mount("#does-not-exist");
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("mount_target_not_found");
    mounted.destroy();
  });
});

describe("Element events", () => {
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
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());
    const listener = vi.fn();
    el.on("ready", listener);

    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    expect(listener).not.toHaveBeenCalled();
    dispatchFromIframe({ type: "arcpay:configured" }, cw);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "ready", field: "card" });
    expect(el.isReady()).toBe(true);
    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    dispatchFromIframe({ type: "arcpay:configured" }, cw);
    expect(listener).toHaveBeenCalledOnce();
    el.destroy();
  });

  it("emits error, change, focus, and blur events for the card field", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());
    const error = vi.fn();
    const change = vi.fn();
    const focus = vi.fn();
    const blur = vi.fn();
    el.on("error", error);
    el.on("change", change);
    el.on("focus", focus);
    el.on("blur", blur);

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "card",
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
    dispatchFromIframe(
      {
        type: "arcpay:focus",
        field: "card",
        help: { code: "enter_card_number", message: "Enter the card number" },
      },
      cw,
    );
    dispatchFromIframe({ type: "arcpay:blur", field: "card", issue: null }, cw);
    dispatchFromIframe(
      {
        type: "arcpay:rejected",
        reason: "domain not authorized",
        code: "origin_not_allowed",
        retryable: false,
      },
      cw,
    );

    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({ type: "change", field: "card", brand: "visa" }),
    );
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ type: "focus", field: "card" }));
    expect(blur).toHaveBeenCalledWith(expect.objectContaining({ type: "blur", field: "card" }));
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", field: "card", code: "origin_not_allowed" }),
    );
    el.destroy();
  });

  it("unsubscribes listener when the returned function is called", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());
    const listener = vi.fn();
    const off = el.on("change", listener);
    off();

    dispatchFromIframe(
      {
        type: "arcpay:change",
        field: "card",
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

describe("Element appearance and commands", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("sends normalized appearance and placeholder updates to the iframe", () => {
    const el = new Element(
      "card",
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
        placeholder: "",
      },
      makeContext(),
    );
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());

    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    el.update({ appearance: { rules: { base: { color: "#0f172a", padding: "12px" } } } });
    el.update({ placeholder: "" });

    expect(cw.postMessage).toHaveBeenCalledWith(
      {
        type: "arcpay:configure",
        field: "card",
        payload: {
          base: {
            "font-family": "Inter, system-ui, sans-serif",
            color: "#111827",
            "--arcpay-placeholder-color": "#9ca3af",
          },
          focus: { "font-weight": "600" },
        },
        placeholder: "",
      },
      IFRAME_ORIGIN,
    );
    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:style", payload: { base: { color: "#0f172a" } } },
      IFRAME_ORIGIN,
    );
    expect(cw.postMessage).toHaveBeenCalledWith(
      { type: "arcpay:placeholder", field: "card", placeholder: "" },
      IFRAME_ORIGIN,
    );
    el.destroy();
  });

  it("focus and clear send commands to the iframe", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());

    el.focus();
    el.clear();

    expect(cw.postMessage).toHaveBeenCalledWith({ type: "arcpay:focus" }, IFRAME_ORIGIN);
    expect(cw.postMessage).toHaveBeenCalledWith({ type: "arcpay:clear" }, IFRAME_ORIGIN);
    el.destroy();
  });

  it("send() throws ArcPayError(not_mounted) before mount", () => {
    const el = new Element("card", {}, makeContext());
    const err = (() => {
      try {
        el.send({ type: "arcpay:focus" });
      } catch (e) {
        return e;
      }
    })() as ArcPayError;
    expect(err).toBeInstanceOf(ArcPayError);
    expect(err.code).toBe("not_mounted");
  });
});

describe("Element origin and source guard", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("ignores postMessages from wrong origin or source", () => {
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    mockIframeContentWindow(getIframe());
    const listener = vi.fn();
    el.on("ready", listener);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "arcpay:ready" },
        origin: "https://evil.example.com",
      }),
    );
    const event = new MessageEvent("message", {
      data: { type: "arcpay:ready" },
      origin: IFRAME_ORIGIN,
    });
    Object.defineProperty(event, "source", { value: { postMessage: vi.fn() } });
    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();
    el.destroy();
  });
});

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
    const el = new Element("card", {}, makeContext());
    el.mount(container);
    const cw = mockIframeContentWindow(getIframe());
    const listener = vi.fn();
    el.on("ready", listener);

    el.destroy();

    expect(document.querySelector("iframe")).toBeNull();
    dispatchFromIframe({ type: "arcpay:ready" }, cw);
    expect(listener).not.toHaveBeenCalled();
    expect(el.isReady()).toBe(false);
  });
});
