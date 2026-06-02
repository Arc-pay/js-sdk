import { ArcPayError } from "../core/errors";

export type FieldType = "cardNumber" | "cardExpiry" | "cardCvv";

// Parent → iframe
export type ParentToIframe =
  | { type: "arcpay:hello"; origin: string; publishableKey: string; channelId: string }
  | { type: "arcpay:configure"; field: FieldType; payload: StyleSubset; placeholder?: string }
  | { type: "arcpay:style"; payload: StyleSubset }
  | { type: "arcpay:placeholder"; field: FieldType; placeholder: string }
  | { type: "arcpay:focus" }
  | { type: "arcpay:clear" }
  | { type: "arcpay:tokenize"; paymentId: string; idempotencyKey: string };

// iframe → parent
export type IframeToParent =
  | { type: "arcpay:ready" }
  | { type: "arcpay:configured" }
  | { type: "arcpay:rejected"; reason: string }
  | {
      type: "arcpay:change";
      field: FieldType;
      isValid: boolean;
      isEmpty: boolean;
      isComplete: boolean;
      brand?: string;
      lastFour?: string;
    }
  | {
      type: "arcpay:tokenize-result";
      cardTokenId: string;
      cardMask: string;
      cardScheme: string;
      cardBin: string;
      expiresIn: number;
      expiresAt: string;
    }
  | { type: "arcpay:tokenize-error"; errorType: string; code?: string; message: string };

export interface StyleSubset {
  base: Record<string, string>;
  invalid?: Record<string, string>;
  focus?: Record<string, string>;
  complete?: Record<string, string>;
  empty?: Record<string, string>;
}

type TokenizeErrorType = "validation_error" | "configuration_error" | "network_error" | "api_error";

const ARCPAY_TYPE_PREFIX = "arcpay:";
const FIELDS: readonly FieldType[] = ["cardNumber", "cardExpiry", "cardCvv"];
const TOKENIZE_ERROR_TYPES: readonly TokenizeErrorType[] = [
  "validation_error",
  "configuration_error",
  "network_error",
  "api_error",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");

const isStyleSubset = (value: unknown): value is StyleSubset => {
  if (!isRecord(value)) return false;
  return (
    isStringRecord(value.base) &&
    (value.invalid === undefined || isStringRecord(value.invalid)) &&
    (value.focus === undefined || isStringRecord(value.focus)) &&
    (value.complete === undefined || isStringRecord(value.complete)) &&
    (value.empty === undefined || isStringRecord(value.empty))
  );
};

const isField = (value: unknown): value is FieldType =>
  typeof value === "string" && FIELDS.includes(value as FieldType);

const isTokenizeErrorType = (value: unknown): value is TokenizeErrorType =>
  typeof value === "string" && TOKENIZE_ERROR_TYPES.includes(value as TokenizeErrorType);

const isArcpayMessage = (data: unknown): data is { type: string } =>
  typeof data === "object" &&
  data !== null &&
  "type" in data &&
  typeof (data as { type: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith(ARCPAY_TYPE_PREFIX);

const isKnownArcpayMessage = (data: unknown): data is ParentToIframe | IframeToParent => {
  if (!isArcpayMessage(data)) return false;
  switch (data.type) {
    case "arcpay:hello":
      return (
        "origin" in data &&
        "publishableKey" in data &&
        "channelId" in data &&
        typeof data.origin === "string" &&
        typeof data.publishableKey === "string" &&
        typeof data.channelId === "string"
      );
    case "arcpay:configure":
      return (
        "field" in data &&
        "payload" in data &&
        isField(data.field) &&
        isStyleSubset(data.payload) &&
        (!("placeholder" in data) || typeof data.placeholder === "string")
      );
    case "arcpay:style":
      return "payload" in data && isStyleSubset(data.payload);
    case "arcpay:placeholder":
      return (
        "field" in data &&
        "placeholder" in data &&
        isField(data.field) &&
        typeof data.placeholder === "string"
      );
    case "arcpay:focus":
    case "arcpay:clear":
    case "arcpay:ready":
    case "arcpay:configured":
      return true;
    case "arcpay:tokenize":
      return (
        "paymentId" in data &&
        "idempotencyKey" in data &&
        typeof data.paymentId === "string" &&
        typeof data.idempotencyKey === "string"
      );
    case "arcpay:rejected":
      return "reason" in data && typeof data.reason === "string";
    case "arcpay:change":
      return (
        "field" in data &&
        "isValid" in data &&
        "isEmpty" in data &&
        "isComplete" in data &&
        isField(data.field) &&
        typeof data.isValid === "boolean" &&
        typeof data.isEmpty === "boolean" &&
        typeof data.isComplete === "boolean" &&
        (!("brand" in data) || data.brand === undefined || typeof data.brand === "string") &&
        (!("lastFour" in data) || data.lastFour === undefined || typeof data.lastFour === "string")
      );
    case "arcpay:tokenize-result":
      return (
        "cardTokenId" in data &&
        "cardMask" in data &&
        "cardScheme" in data &&
        "cardBin" in data &&
        "expiresIn" in data &&
        "expiresAt" in data &&
        typeof data.cardTokenId === "string" &&
        typeof data.cardMask === "string" &&
        typeof data.cardScheme === "string" &&
        typeof data.cardBin === "string" &&
        typeof data.expiresIn === "number" &&
        Number.isFinite(data.expiresIn) &&
        typeof data.expiresAt === "string"
      );
    case "arcpay:tokenize-error":
      return (
        "errorType" in data &&
        "message" in data &&
        isTokenizeErrorType(data.errorType) &&
        (!("code" in data) || data.code === undefined || typeof data.code === "string") &&
        typeof data.message === "string"
      );
    default:
      return false;
  }
};

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
    throw new ArcPayError({
      type: "validation_error",
      code: "wildcard_origin_forbidden",
      message: "postToParent: targetOrigin cannot be '*'",
      retryable: false,
    });
  }
  window.parent.postMessage(message, targetOrigin);
};

export const parseIncoming = <T extends { type: string }>(
  event: MessageEvent,
  expectedOrigin: string,
): T | null => {
  if (event.origin !== expectedOrigin) return null;
  if (!isKnownArcpayMessage(event.data)) return null;
  return event.data as T;
};
