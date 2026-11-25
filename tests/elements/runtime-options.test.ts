import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { Element, type ElementContext, type ElementEvent } from "../../src/elements/element";
import { Elements } from "../../src/elements/elements";
import { parseIncoming } from "../../src/elements/postmessage";
import { sanitizeRuntimeOptions } from "../../src/elements/options";
import { buildStyleFromAppearance, sanitizeStyle } from "../../src/elements/style";

const IFRAME_ORIGIN = "https://sdk.arcpay.space";
const CHANNEL_ID = "channel-runtime-options";
const ctx: ElementContext = {
  iframeBase: IFRAME_ORIGIN,
  publishableKey: "pk_test_abc123",
  channelId: CHANNEL_ID,
};

function mockWindow(iframe: HTMLIFrameElement) {
  const mock = { postMessage: vi.fn() };
  Object.defineProperty(iframe, "contentWindow", { configurable: true, get: () => mock });
  return mock;
}

function fromIframe(data: Record<string, unknown>, source: object, channelId = CHANNEL_ID) {
  const event = new MessageEvent("message", {
    data: { field: "card", channelId, ...data },
    origin: IFRAME_ORIGIN,
  });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
}

const sentOfType = (mock: { postMessage: ReturnType<typeof vi.fn> }, type: string) =>
  mock.postMessage.mock.calls.map((call) => call[0]).filter((m) => m.type === type);

describe("sanitizeRuntimeOptions", () => {
  it("accepts every documented option", () => {
    const options = {
      locale: "ru",
      texts: {
        placeholders: { cardNumber: "0000 0000" },
        labels: { cardCvv: "CVC" },
        errors: { card_number_invalid: "Bad number" },
      },
      layout: { gap: "8px", expiryWidth: "6rem", cvvWidth: "0" },
      disabled: true,
      readOnly: false,
      autofocus: true,
      showBrandIcon: true,
      maskCvv: false,
      expiryYearFormat: "YYYY",
      autoAdvance: true,
    };
    expect(sanitizeRuntimeOptions(options, { strict: true })).toEqual(options);
  });

  it("throws on mistakes in strict mode so integrators see them", () => {
    const bad: unknown[] = [
      { locale: "de" },
      { texts: { placeholders: { cardPin: "x" } } },
      { texts: { errors: { not_a_code: "x" } } },
      { texts: { labels: { cardNumber: "<b>x</b>" } } },
      { layout: { gap: "10" } },
      { layout: { margin: "1px" } },
      { disabled: "yes" },
      { expiryYearFormat: "Y" },
    ];
    for (const options of bad) {
      expect(() => sanitizeRuntimeOptions(options, { strict: true })).toThrow(ArcPayError);
    }
  });

  it("drops what it does not understand in lenient mode (iframe side)", () => {
    expect(
      sanitizeRuntimeOptions(
        { locale: "de", disabled: "yes", layout: { gap: "10", cvvWidth: "5em" }, extra: 1 },
        { strict: false },
      ),
    ).toEqual({ layout: { cvvWidth: "5em" } });
  });
});

describe("appearance states and themes", () => {
  it("supports disabled, hover and autofill blocks", () => {
    const out = buildStyleFromAppearance({
      rules: {
        disabled: { opacity: "0.5" },
        hover: { "border-color": "#999" },
        autofill: { "background-color": "#fff", color: "#111", transform: "scale(2)" } as never,
      },
    });
    expect(out.disabled).toEqual({ opacity: "0.5" });
    expect(out.hover).toEqual({ "border-color": "#999" });
    expect(out.autofill).toEqual({ "background-color": "#fff", color: "#111" });
  });

  it("ships a dark theme with a color-scheme and readable placeholder", () => {
    const out = buildStyleFromAppearance({ theme: "arcpay-dark" });
    expect(out.base).toMatchObject({
      "color-scheme": "dark",
      color: "#f9fafb",
      "font-variant-numeric": "tabular-nums",
    });
    expect(buildStyleFromAppearance({ theme: "arcpay" }).base["--arcpay-placeholder-color"]).toBe(
      "#6b7280",
    );
  });

  it("refuses values that could open a second CSS declaration", () => {
    const out = sanitizeStyle({
      base: { color: "red; position: fixed", "background-color": "#fff" },
    });
    expect(out.base).toEqual({ "background-color": "#fff" });
  });
});

describe("Element runtime options", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("rejects invalid options at construction, before anything is mounted", () => {
    expect(() => new Element("card", { locale: "de" as never }, ctx)).toThrow(ArcPayError);
    expect(() => new Element("card", { minHeight: "tall" }, ctx)).toThrow(ArcPayError);
  });

  it("rejects an unsupported theme at construction instead of hanging the handshake", () => {
    expect(
      () => new Element("card", { appearance: { theme: "neon" as never } }, ctx),
    ).toThrow(expect.objectContaining({ code: "invalid_hosted_fields_theme" }));
    expect(() => {
      const els = new Elements({
        publishableKey: "pk_test_x",
        iframeBase: IFRAME_ORIGIN,
        appearance: { theme: "neon" as never },
      });
      els.create("card");
    }).toThrow(expect.objectContaining({ code: "invalid_hosted_fields_theme" }));
    const live = new Element("card", {}, ctx);
    live.mount(container);
    mockWindow(document.querySelector("iframe")!);
    expect(() => live.update({ appearance: { theme: "neon" as never } })).toThrow(ArcPayError);
    live.destroy();
  });

  it("validates and honors mountTimeoutMs", () => {
    for (const bad of [0, 2999, 120001, 5000.5, "5000" as never]) {
      expect(() => new Element("card", { mountTimeoutMs: bad }, ctx)).toThrow(ArcPayError);
    }
    vi.useFakeTimers();
    const el = new Element("card", { mountTimeoutMs: 20000 }, ctx);
    const seen: string[] = [];
    el.on("loaderror", (e) => seen.push(e.type === "loaderror" ? e.code : ""));
    el.mount(container);
    vi.advanceTimersByTime(19999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(seen).toEqual(["iframe_ready_timeout"]);
    el.destroy();
    vi.useRealTimers();
  });

  it("sends runtime options inside configure and omits the key when there are none", () => {
    const withOptions = new Element(
      "card",
      { locale: "ru", showBrandIcon: true, texts: { placeholders: { cardCvv: "CVC" } } },
      ctx,
    );
    withOptions.mount(container);
    const mock = mockWindow(document.querySelector("iframe")!);
    fromIframe({ type: "arcpay:ready" }, mock);
    expect(sentOfType(mock, "arcpay:configure")[0].options).toEqual({
      locale: "ru",
      showBrandIcon: true,
      texts: { placeholders: { cardCvv: "CVC" } },
    });
    withOptions.destroy();

    const plain = new Element("card", {}, ctx);
    plain.mount(container);
    const plainMock = mockWindow(document.querySelector("iframe")!);
    fromIframe({ type: "arcpay:ready" }, plainMock);
    expect(sentOfType(plainMock, "arcpay:configure")[0]).not.toHaveProperty("options");
    plain.destroy();
  });

  it("applies minHeight at mount and on update", () => {
    const el = new Element("cardNumber", { minHeight: "52px" }, ctx);
    el.mount(container);
    const iframe = document.querySelector("iframe")!;
    mockWindow(iframe);
    expect(iframe.style.minHeight).toBe("52px");
    el.update({ minHeight: "3rem" });
    expect(iframe.style.minHeight).toBe("3rem");
    el.destroy();
  });

  it("update() pushes runtime changes to the iframe as arcpay:options", () => {
    const el = new Element("card", {}, ctx);
    el.mount(container);
    const mock = mockWindow(document.querySelector("iframe")!);
    el.update({ disabled: true, expiryYearFormat: "YYYY" });
    expect(sentOfType(mock, "arcpay:options")).toEqual([
      { type: "arcpay:options", options: { disabled: true, expiryYearFormat: "YYYY" } },
    ]);
    el.update({ label: "Card" });
    expect(sentOfType(mock, "arcpay:options")).toHaveLength(1);
    expect(() => el.update({ layout: { gap: "huge" } })).toThrow(ArcPayError);
    el.destroy();
  });

  it("emits loading on mount and submit/escape from the iframe", () => {
    const el = new Element("card", {}, ctx);
    const events: ElementEvent["type"][] = [];
    for (const name of ["loading", "submit", "escape"] as const) {
      el.on(name, (event) => events.push(event.type));
    }
    el.mount(container);
    const mock = mockWindow(document.querySelector("iframe")!);
    fromIframe({ type: "arcpay:submit" }, mock);
    fromIframe({ type: "arcpay:escape" }, mock);
    expect(events).toEqual(["loading", "submit", "escape"]);
    el.destroy();
  });
});

describe("protocol messages", () => {
  const parse = (data: unknown) =>
    parseIncoming(new MessageEvent("message", { data, origin: IFRAME_ORIGIN }), IFRAME_ORIGIN);

  it("accepts submit, escape, options and configure-with-options", () => {
    expect(parse({ type: "arcpay:submit", field: "card", channelId: "c" })).not.toBeNull();
    expect(parse({ type: "arcpay:escape", field: "card", channelId: "c" })).not.toBeNull();
    expect(parse({ type: "arcpay:options", options: { disabled: true } })).not.toBeNull();
    expect(parse({ type: "arcpay:options", options: "nope" })).toBeNull();
    expect(
      parse({
        type: "arcpay:configure",
        field: "card",
        payload: { base: {}, autofill: { color: "red" } },
        options: { locale: "ru" },
      }),
    ).not.toBeNull();
    expect(
      parse({ type: "arcpay:configure", field: "card", payload: { base: {}, hover: 1 } }),
    ).toBeNull();
  });
});

describe("Elements factory options", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("applies factory defaults to every element and lets create() override them", () => {
    const els = new Elements({
      publishableKey: "pk_test_x",
      iframeBase: IFRAME_ORIGIN,
      locale: "ru",
      showBrandIcon: true,
      minHeight: "50px",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    els.create("cardNumber", { showBrandIcon: false, minHeight: "60px" }).mount(container);
    const iframe = document.querySelector("iframe")!;
    const mock = mockWindow(iframe);
    const channel = (els as unknown as { channelId: string }).channelId;
    fromIframe({ type: "arcpay:ready", field: "cardNumber" }, mock, channel);
    expect(iframe.style.minHeight).toBe("60px");
    expect(sentOfType(mock, "arcpay:configure")[0].options).toEqual({
      locale: "ru",
      showBrandIcon: false,
    });
    els.destroy();
  });

  it("applies a factory-level mountTimeoutMs to every element", () => {
    vi.useFakeTimers();
    const els = new Elements({ publishableKey: "pk_test_x", iframeBase: IFRAME_ORIGIN, mountTimeoutMs: 15000 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const seen: string[] = [];
    const card = els.create("card");
    card.on("loaderror", (e) => seen.push(e.type));
    card.mount(container);
    vi.advanceTimersByTime(14999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(seen).toEqual(["loaderror"]);
    els.destroy();
    vi.useRealTimers();
  });

  it("validates the tokenize timeout before doing any work", async () => {
    const els = new Elements({ publishableKey: "pk_test_x", iframeBase: IFRAME_ORIGIN });
    for (const timeoutMs of [0, 500, 130_000, 1500.5]) {
      await expect(els.tokenize("pay_1", "idem_1", { timeoutMs })).rejects.toMatchObject({
        code: "invalid_tokenize_timeout",
      });
    }
  });

  it("emits tokenizing and tokenizeerror around a tokenize attempt", async () => {
    const els = new Elements({ publishableKey: "pk_test_x", iframeBase: IFRAME_ORIGIN });
    const container = document.createElement("div");
    document.body.appendChild(container);
    els.create("card").mount(container);
    const iframe = document.querySelector("iframe")!;
    const mock = mockWindow(iframe);
    const channel = (els as unknown as { channelId: string }).channelId;
    fromIframe({ type: "arcpay:ready" }, mock, channel);
    fromIframe({ type: "arcpay:configured" }, mock, channel);

    const seen: string[] = [];
    els.on("tokenizing", (event) => seen.push(event.type));
    els.on("tokenizeerror", (event) => {
      if (event.type === "tokenizeerror") seen.push(`${event.type}:${event.error.code}`);
    });
    const attempt = els.tokenize("pay_1", "idem_1", { timeoutMs: 1000 });
    fromIframe(
      {
        type: "arcpay:tokenize-error",
        errorType: "validation_error",
        code: "card_number_invalid",
        message: "Check the card details.",
      },
      mock,
      channel,
    );
    await expect(attempt).rejects.toMatchObject({ code: "card_number_invalid" });
    expect(seen).toEqual(["tokenizing", "tokenizeerror:card_number_invalid"]);
    els.destroy();
  });

  it("moves focus to the next ready split field when autoAdvance is on", () => {
    const els = new Elements({
      publishableKey: "pk_test_x",
      iframeBase: IFRAME_ORIGIN,
      autoAdvance: true,
    });
    const containers = ["cardNumber", "cardExpiry"].map(() => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      return div;
    });
    const number = els.create("cardNumber");
    const expiry = els.create("cardExpiry");
    number.mount(containers[0]);
    expiry.mount(containers[1]);
    const [numberFrame, expiryFrame] = Array.from(document.querySelectorAll("iframe"));
    const numberMock = mockWindow(numberFrame);
    const expiryMock = mockWindow(expiryFrame);
    const channel = (els as unknown as { channelId: string }).channelId;
    for (const [field, mock] of [
      ["cardNumber", numberMock],
      ["cardExpiry", expiryMock],
    ] as const) {
      fromIframe({ type: "arcpay:ready", field }, mock, channel);
      fromIframe({ type: "arcpay:configured", field }, mock, channel);
    }

    const complete = { isValid: true, isEmpty: false, isComplete: true, issue: null, help: null };
    fromIframe({ type: "arcpay:focus", field: "cardNumber", help: null }, numberMock, channel);
    fromIframe({ type: "arcpay:change", field: "cardNumber", ...complete }, numberMock, channel);
    expect(sentOfType(expiryMock, "arcpay:focus")).toHaveLength(1);

    // Not focused (e.g. autofill or programmatic clear) -> no focus steal.
    fromIframe({ type: "arcpay:blur", field: "cardNumber", issue: null }, numberMock, channel);
    fromIframe({ type: "arcpay:change", field: "cardNumber", ...complete }, numberMock, channel);
    expect(sentOfType(expiryMock, "arcpay:focus")).toHaveLength(1);
    els.destroy();
  });
});
