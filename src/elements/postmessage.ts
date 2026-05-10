import { ArcPayError } from "../core/errors";

export type FieldType = "cardNumber" | "cardExpiry" | "cardCvv";

// Parent → iframe
export type ParentToIframe =
  | { type: "arcpay:hello"; origin: string; publishableKey: string; channelId: string }
  | { type: "arcpay:style"; payload: StyleSubset }
  | { type: "arcpay:focus" }
  | { type: "arcpay:clear" }
  | { type: "arcpay:tokenize"; paymentId: string; idempotencyKey: string };

// iframe → parent
export type IframeToParent =
  | { type: "arcpay:ready" }
  | { type: "arcpay:rejected"; reason: string }
  | {
      type: "arcpay:change";
      field: FieldType;
      isValid: boolean;
      brand?: string;
      lastFour?: string;
    }
  | {
      type: "arcpay:tokenize-result";
      cardTokenId: string;
      cardMask: string;
      cardScheme: string;
      cardBin: string;
      expiresAt: string;
    }
  | { type: "arcpay:tokenize-error"; errorType: string; code?: string; message: string };

export interface StyleSubset {
  base: Record<string, string>;
  invalid?: Record<string, string>;
  focus?: Record<string, string>;
}

const ARCPAY_TYPE_PREFIX = "arcpay:";

const isArcpayMessage = (data: unknown): data is { type: string } =>
  typeof data === "object" &&
  data !== null &&
  "type" in data &&
  typeof (data as { type: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith(ARCPAY_TYPE_PREFIX);

export const postToIframe = (
  iframe: HTMLIFrameElement,
  message: ParentToIframe,
  targetOrigin: string,
): void => {
  if (targetOrigin === "*") {
    throw new ArcPayError({
      type: "validation_error",
      code: "wildcard_origin_forbidden",
      message: "postToIframe: targetOrigin cannot be '*'",
      retryable: false,
    });
  }
  if (!iframe.contentWindow) {
    throw new ArcPayError({
      type: "validation_error",
      code: "iframe_not_loaded",
      message: "postToIframe: iframe.contentWindow is null (iframe not mounted)",
      retryable: false,
    });
  }
  iframe.contentWindow.postMessage(message, targetOrigin);
};

export const postToParent = (message: IframeToParent, targetOrigin: string): void => {
  if (targetOrigin === "*") {
    throw new Error("postToParent: targetOrigin cannot be '*'");
  }
  window.parent.postMessage(message, targetOrigin);
};

export const parseIncoming = <T extends { type: string }>(
  event: MessageEvent,
  expectedOrigin: string,
): T | null => {
  if (event.origin !== expectedOrigin) return null;
  if (!isArcpayMessage(event.data)) return null;
  return event.data as T;
};
