import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArcPayError } from "../../src/core/errors";
import { postToIframe, postToParent, parseIncoming } from "../../src/elements/postmessage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIframe(hasContentWindow: boolean): HTMLIFrameElement {
  const el = document.createElement("iframe");
  if (hasContentWindow) {
    // jsdom doesn't populate contentWindow on orphan iframes — inject a mock.
    const mockContentWindow = { postMessage: vi.fn() };
    Object.defineProperty(el, "contentWindow", {
      configurable: true,
      get: () => mockContentWindow,
    });
  } else {
    Object.defineProperty(el, "contentWindow", {
      configurable: true,
      get: () => null,
    });
  }
  return el;
}

function makeMessageEvent(data: unknown, origin: string): MessageEvent {
  return new MessageEvent("message", { data, origin });
}

// ---------------------------------------------------------------------------
// postToIframe
// ---------------------------------------------------------------------------

describe("postToIframe", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts the message to iframe.contentWindow with the given targetOrigin", () => {
    const iframe = makeIframe(true);
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      get: () => ({ postMessage: postMessageSpy }),
    });

    const msg = {
      type: "arcpay:hello" as const,
      origin: "https://merchant.example.com",
      publishableKey: "pk_test_abc",
      channelId: "channel-test-123",
    };
    postToIframe(iframe, msg, "https://elements.arcpay.space");

    expect(postMessageSpy).toHaveBeenCalledOnce();
    expect(postMessageSpy).toHaveBeenCalledWith(msg, "https://elements.arcpay.space");
  });

  it("throws ArcPayError(wildcard_origin_forbidden) when targetOrigin is '*'", () => {
    const iframe = makeIframe(true);
    const msg = {
      type: "arcpay:hello" as const,
      origin: "https://merchant.example.com",
      publishableKey: "pk_test_abc",
      channelId: "channel-test-123",
    };
    expect(() => postToIframe(iframe, msg, "*")).toThrowError(ArcPayError);
    expect(() => postToIframe(iframe, msg, "*")).toThrow(
      /wildcard_origin_forbidden|cannot be '\*'/,
    );
  });

  it("throws ArcPayError(iframe_not_loaded) when iframe.contentWindow is null", () => {
    const iframe = makeIframe(false);
    const msg = { type: "arcpay:clear" as const };
    expect(() => postToIframe(iframe, msg, "https://elements.arcpay.space")).toThrowError(
      ArcPayError,
    );
    expect(() => postToIframe(iframe, msg, "https://elements.arcpay.space")).toThrow(
      /iframe_not_loaded|contentWindow is null/,
    );
  });
});

// ---------------------------------------------------------------------------
// postToParent
// ---------------------------------------------------------------------------

describe("postToParent", () => {
  let originalParent: Window;

  beforeEach(() => {
    originalParent = window.parent;
  });

  afterEach(() => {
    Object.defineProperty(window, "parent", {
      configurable: true,
      get: () => originalParent,
    });
    vi.restoreAllMocks();
  });

  it("calls window.parent.postMessage with the correct message and targetOrigin", () => {
    const postMessageSpy = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      get: () => ({ postMessage: postMessageSpy }),
    });

    const msg = { type: "arcpay:ready" as const };
    postToParent(msg, "https://merchant.example.com");

    expect(postMessageSpy).toHaveBeenCalledOnce();
    expect(postMessageSpy).toHaveBeenCalledWith(msg, "https://merchant.example.com");
  });

  it("throws when targetOrigin is '*'", () => {
    const msg = { type: "arcpay:ready" as const };
    expect(() => postToParent(msg, "*")).toThrowError(ArcPayError);
    expect(() => postToParent(msg, "*")).toThrow(/cannot be '\*'/);
  });
});

// ---------------------------------------------------------------------------
// parseIncoming
// ---------------------------------------------------------------------------

describe("parseIncoming", () => {
  const EXPECTED_ORIGIN = "https://merchant.example.com";

  it("returns null when event.origin does not match expectedOrigin", () => {
    const event = makeMessageEvent({ type: "arcpay:ready" }, "https://evil.attacker.com");
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns null for non-arcpay messages (no type)", () => {
    const event = makeMessageEvent({ foo: "bar" }, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns null for messages with non-arcpay: type prefix", () => {
    const event = makeMessageEvent({ type: "stripe:ready" }, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns null for null data", () => {
    const event = makeMessageEvent(null, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns null for primitive data", () => {
    const event = makeMessageEvent("arcpay:ready", EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns the typed message for matching origin and arcpay: type", () => {
    const data = { type: "arcpay:ready" as const };
    const event = makeMessageEvent(data, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBe(data);
  });

  it("accepts parent focus commands without treating them as iframe focus events", () => {
    const data = { type: "arcpay:focus" as const };
    const event = makeMessageEvent(data, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBe(data);
  });

  it("accepts iframe focus events only with a valid field and help payload", () => {
    const data = {
      type: "arcpay:focus" as const,
      field: "cardNumber" as const,
      help: { code: "card_brand_detected", message: "Card brand detected", brand: "visa" },
    };
    const event = makeMessageEvent(data, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBe(data);
  });

  it("rejects structurally invalid iframe focus events", () => {
    const event = makeMessageEvent(
      { type: "arcpay:focus", field: "notAField", help: null },
      EXPECTED_ORIGIN,
    );
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("rejects unknown arcpay message types", () => {
    const event = makeMessageEvent({ type: "arcpay:legacy-ready" }, EXPECTED_ORIGIN);
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("rejects structurally invalid tokenize-result messages", () => {
    const event = makeMessageEvent(
      {
        type: "arcpay:tokenize-result",
        cardTokenId: "tok_1",
        cardMask: "427600****1234",
        cardScheme: "visa",
        cardBin: "427600",
        expiresIn: "300",
        expiresAt: "2028-12-31T23:59:59Z",
      },
      EXPECTED_ORIGIN,
    );
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("rejects structurally invalid change messages", () => {
    const event = makeMessageEvent(
      {
        type: "arcpay:change",
        field: "cardNumber",
        isValid: "true",
        isEmpty: false,
        isComplete: true,
      },
      EXPECTED_ORIGIN,
    );
    expect(parseIncoming(event, EXPECTED_ORIGIN)).toBeNull();
  });

  it("returns arcpay:change message with all fields intact", () => {
    const data = {
      type: "arcpay:change" as const,
      field: "cardNumber" as const,
      isValid: true,
      isEmpty: false,
      isComplete: true,
      brand: "visa",
      lastFour: "1234",
      issue: null,
      help: { code: "card_brand_detected", message: "Card brand detected", brand: "visa" },
    };
    const event = makeMessageEvent(data, EXPECTED_ORIGIN);
    const result = parseIncoming(event, EXPECTED_ORIGIN);
    expect(result).toEqual(data);
  });
});
