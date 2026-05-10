export { ArcPay } from "./core/arcpay";
export type { ArcPayInstance, ArcPayLoadOptions } from "./core/arcpay";
export {
  ArcPayError,
  isValidationError,
  isApiError,
  isNetworkError,
  isChallengeAborted,
} from "./core/errors";
export type { ArcPayErrorType } from "./core/errors";
export type { Environment } from "./core/env";
export type { TokenizeRequest, TokenizeResult } from "./tokenize/tokenize";
export type { CardScheme } from "./tokenize/scheme";
export const SDK_VERSION = "0.1.0";

// Hosted Fields postMessage protocol
export type {
  FieldType,
  ParentToIframe,
  IframeToParent,
  StyleSubset,
} from "./elements/postmessage";
export { postToIframe, postToParent, parseIncoming } from "./elements/postmessage";

// Style sanitizer — also used by elements iframe app (defense-in-depth on receipt)
export { sanitizeStyle } from "./elements/style";

// Hosted Fields — Element class + Elements factory
export { Element } from "./elements/element";
export type { ElementOptions, ElementEvent, ElementContext } from "./elements/element";
export { Elements } from "./elements/elements";
export type { ElementsOptions } from "./elements/elements";

// Luhn check (used by elements app for card-number validation)
export { luhnCheck } from "./tokenize/luhn";
