import { ArcPayError, validationError } from "../core/errors";
import { Element, emitSafely, type ElementContext, type ElementOptions } from "./element";
import type { FieldType, IframeToParent, SplitFieldType } from "./postmessage";
import { parseIncoming } from "./postmessage";
import type { TokenizeResult } from "../tokenize/tokenize";
import type { HostedFieldsAppearance } from "./style";
import { pickRuntimeOptions, type HostedFieldsRuntimeOptions } from "./options";

export type {};

export interface ElementsOptions extends HostedFieldsRuntimeOptions {
  /** Default iframe-safe input appearance applied to elements created by this factory. */
  appearance?: HostedFieldsAppearance;
  /** Default minimum iframe height for every element. */
  minHeight?: string;
  /** Default `mountTimeoutMs` for every element (see ElementOptions). */
  mountTimeoutMs?: number;
}

export interface TokenizeOptions {
  /** Reject after this many ms (default 30000, min 5000). Client side only. */
  timeoutMs?: number;
}

export interface RecipientCardResult {
  setupId: string;
  cardTokenId: string;
  cardMask: string;
  /** Empty string when the card network is unknown. */
  cardScheme: string;
  /** End of the token storage period (not the card expiry); omitted when none is configured. */
  expiresAt?: string;
}

export type ElementsEvent =
  | { type: "tokenizing"; paymentId: string }
  | { type: "tokenized"; paymentId: string; result: TokenizeResult }
  | { type: "tokenizeerror"; paymentId: string; error: ArcPayError };

type ElementsListener = (event: ElementsEvent) => void;
type ElementsEventName = ElementsEvent["type"];

const DEFAULT_TOKENIZE_TIMEOUT_MS = 30_000;
const MIN_TOKENIZE_TIMEOUT_MS = 5_000;
const MAX_TOKENIZE_TIMEOUT_MS = 120_000;

const DEFAULT_IFRAME_BASE = "https://sdk.arcpay.space";
const SPLIT_FIELDS = [
  "cardNumber",
  "cardExpiry",
  "cardCvv",
] as const satisfies readonly SplitFieldType[];

const createChannelId = (): string => {
  if (!globalThis.crypto?.randomUUID) {
    throw validationError("crypto_unavailable", "crypto.randomUUID is required for Hosted Fields");
  }
  return globalThis.crypto.randomUUID();
};

const assertNonEmptyTokenizeInput = (
  name: "paymentId" | "idempotencyKey",
  value: unknown,
): void => {
  if (typeof value === "string" && value.trim().length > 0) return;
  throw validationError(name === "paymentId" ? "missing_payment_id" : "missing_idempotency_key", `${name} must be a non-empty string`);
};

const resolveTokenizeTimeout = (options: TokenizeOptions): number => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TOKENIZE_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TOKENIZE_TIMEOUT_MS ||
    timeoutMs > MAX_TOKENIZE_TIMEOUT_MS
  ) {
    throw validationError("invalid_tokenize_timeout", `timeoutMs must be an integer between ${MIN_TOKENIZE_TIMEOUT_MS} and ${MAX_TOKENIZE_TIMEOUT_MS}`);
  }
  return timeoutMs;
};

const bridgeError = (
  data: Extract<IframeToParent, { type: "arcpay:tokenize-error" }>,
  paymentId?: string,
): ArcPayError =>
  new ArcPayError({
    type:
      data.errorType === "validation_error" ||
      data.errorType === "configuration_error" ||
      data.errorType === "network_error" ||
      data.errorType === "api_error"
        ? data.errorType
        : "api_error",
    code: data.code,
    message: data.message,
    retryable: false,
    paymentId,
  });

const tokenizeTimeoutError = (method: string, timeoutMs: number, paymentId?: string): ArcPayError =>
  new ArcPayError({
    type: "network_error",
    code: "tokenize_timeout",
    message: `${method} timed out after ${timeoutMs / 1000} seconds`,
    retryable: true,
    paymentId,
  });

export class Elements {
  private readonly elementMap = new Map<FieldType, Element>();
  private readonly iframeBase: string;
  private readonly publishableKey: string;
  private readonly channelId: string;
  private tokenizeInFlight = false;
  private readonly defaults: ElementOptions;
  private readonly listeners: Record<ElementsEventName, Set<ElementsListener>> = {
    tokenizing: new Set<ElementsListener>(),
    tokenized: new Set<ElementsListener>(),
    tokenizeerror: new Set<ElementsListener>(),
  };

  constructor(
    opts: {
      publishableKey: string;
      iframeBase?: string;
    } & ElementsOptions,
  ) {
    this.publishableKey = opts.publishableKey;
    this.iframeBase = opts.iframeBase ?? DEFAULT_IFRAME_BASE;
    this.channelId = createChannelId();
    this.defaults = {
      ...pickRuntimeOptions(opts),
      ...(opts.appearance !== undefined ? { appearance: opts.appearance } : {}),
      ...(opts.minHeight !== undefined ? { minHeight: opts.minHeight } : {}),
      ...(opts.mountTimeoutMs !== undefined ? { mountTimeoutMs: opts.mountTimeoutMs } : {}),
    };
  }

  on(event: ElementsEventName, callback: ElementsListener): () => void {
    this.listeners[event].add(callback);
    return () => this.listeners[event].delete(callback);
  }

  private emit(event: ElementsEvent): void {
    emitSafely(this.listeners[event.type], event);
  }

  create(field: FieldType, options: ElementOptions = {}): Element {
    if (field === "card" && SPLIT_FIELDS.some((splitField) => this.elementMap.has(splitField))) {
      throw validationError("mixed_hosted_fields_mode", "Use either the composite card Element or split cardNumber/cardExpiry/cardCvv Elements, not both.");
    }
    if (field !== "card" && this.elementMap.has("card")) {
      throw validationError("mixed_hosted_fields_mode", "Use either the composite card Element or split cardNumber/cardExpiry/cardCvv Elements, not both.");
    }
    if (this.elementMap.has(field)) {
      throw validationError("duplicate_element", `Element for ${field} already created`);
    }
    const ctx: ElementContext = {
      iframeBase: this.iframeBase,
      publishableKey: this.publishableKey,
      channelId: this.channelId,
    };
    const merged: ElementOptions = { ...this.defaults };
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const element = new Element(field, merged, ctx);
    this.elementMap.set(field, element);
    this.wireAutoAdvance(field, element);
    return element;
  }

  private wireAutoAdvance(field: FieldType, element: Element): void {
    if (field === "card") return;
    let focused = false;
    let wasDone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => clearTimeout(timer);
    element.on("focus", () => {
      focused = true;
    });
    element.on("blur", () => {
      focused = false;
      cancel();
    });
    element.on("change", (event) => {
      if (event.type !== "change") return;
      cancel();
      const was = wasDone;
      wasDone = event.isComplete && event.isValid;
      if (!wasDone || was || !element.autoAdvance || !focused) return;
      timer = setTimeout(() => {
        const next = SPLIT_FIELDS[SPLIT_FIELDS.indexOf(field as SplitFieldType) + 1];
        const nextElement = next ? this.elementMap.get(next) : undefined;
        if (nextElement?.isReady()) nextElement.focus();
      }, 300);
    });
  }

  async tokenize(
    paymentId: string,
    idempotencyKey: string,
    options: TokenizeOptions = {},
  ): Promise<TokenizeResult> {
    assertNonEmptyTokenizeInput("paymentId", paymentId);
    assertNonEmptyTokenizeInput("idempotencyKey", idempotencyKey);
    const timeoutMs = resolveTokenizeTimeout(options);

    // C2: concurrent-call guard — only one tokenize() may be in-flight at a time.
    if (this.tokenizeInFlight) {
      throw validationError("tokenize_in_progress", "A tokenize() call is already in progress for this Elements instance");
    }

    const card = this.elementMap.get("card");
    const splitCardNumber = this.elementMap.get("cardNumber");

    if (!card && !splitCardNumber) {
      throw validationError("incomplete_elements", "Create either a secure card Element or split cardNumber/cardExpiry/cardCvv Elements before tokenize()");
    }
    const tokenizeElement = card ?? splitCardNumber;
    if (!tokenizeElement) {
      throw validationError("incomplete_elements", "Create either a secure card Element or split cardNumber/cardExpiry/cardCvv Elements before tokenize()");
    }
    if (card && !tokenizeElement.isReady()) {
      throw validationError("elements_not_ready", "Wait for all secure card fields to fire 'ready' before tokenize()");
    }
    if (!card) {
      for (const splitField of SPLIT_FIELDS) {
        const element = this.elementMap.get(splitField);
        if (!element) {
          throw validationError("incomplete_elements", "Split Hosted Fields require cardNumber, cardExpiry, and cardCvv before tokenize()");
        }
        if (!element.isReady()) {
          throw validationError("elements_not_ready", "Wait for all secure card fields to fire 'ready' before tokenize()");
        }
      }
    }

    this.tokenizeInFlight = true;
    this.emit({ type: "tokenizing", paymentId });
    try {
      const result = await this.doTokenize(tokenizeElement, paymentId, idempotencyKey, timeoutMs);
      this.emit({ type: "tokenized", paymentId, result });
      return result;
    } catch (error) {
      if (error instanceof ArcPayError) this.emit({ type: "tokenizeerror", paymentId, error });
      throw error;
    } finally {
      this.tokenizeInFlight = false;
    }
  }

  private doTokenize(
    card: Element,
    paymentId: string,
    idempotencyKey: string,
    timeoutMs: number,
  ): Promise<TokenizeResult> {
    const iframeOrigin = new URL(this.iframeBase).origin;
    // C1: obtain reference to the card iframe's contentWindow before
    // registering the listener so we can fail closed and filter by source.
    const cardIframeWindow = card.getIframeContentWindow();
    if (!cardIframeWindow) {
      return Promise.reject(
        new ArcPayError({
          type: "validation_error",
          code: "iframe_not_loaded",
          message: "tokenize() cannot start because the card iframe is not loaded",
          retryable: false,
          paymentId,
        }),
      );
    }

    return new Promise<TokenizeResult>((resolve, reject) => {
      // C3: bounded timeout (default 30 s) — rejects and cleans up if no result arrives.
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(tokenizeTimeoutError("tokenize()", timeoutMs, paymentId));
      }, timeoutMs);

      const onMessage = (event: MessageEvent) => {
        // C4: use parseIncoming for origin + arcpay: prefix guard.
        const data = parseIncoming<IframeToParent>(event, iframeOrigin);
        if (!data) return;
        const channelId = "channelId" in data ? data.channelId : undefined;
        if (typeof channelId !== "string" || channelId !== this.channelId) return;
        if (event.source !== cardIframeWindow) return;

        if (data.type === "arcpay:tokenize-result") {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          resolve({
            cardTokenId: data.cardTokenId,
            cardMask: data.cardMask,
            cardScheme: data.cardScheme,
            cardBin: data.cardBin,
            expiresIn: data.expiresIn,
            expiresAt: data.expiresAt,
          });
        } else if (data.type === "arcpay:tokenize-error") {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          reject(bridgeError(data, paymentId));
        }
      };

      window.addEventListener("message", onMessage);
      card.send({ type: "arcpay:tokenize", paymentId, idempotencyKey });
    });
  }

  /**
   * Tokenizes a payout recipient card entered in the `cardNumber` Element and attaches it to
   * the card setup `setupId` created by the merchant backend. Only the card number is used
   * (no expiry or CVC); the PAN stays inside the Elements iframe and goes only to card-entry.
   * Confirm the returned `cardTokenId` on the backend (webhook
   * `customer_transfer_card_setup.completed` or GET of the setup) before paying out to it.
   */
  async tokenizeRecipientCard(
    setupId: string,
    options: TokenizeOptions = {},
  ): Promise<RecipientCardResult> {
    if (typeof setupId !== "string" || setupId.trim().length === 0) {
      throw validationError("missing_setup_id", "setupId must be a non-empty string");
    }
    const timeoutMs = resolveTokenizeTimeout(options);
    if (this.tokenizeInFlight) {
      throw validationError("tokenize_in_progress", "A tokenize() call is already in progress for this Elements instance");
    }
    if (this.elementMap.has("card") || this.elementMap.has("cardExpiry") || this.elementMap.has("cardCvv")) {
      throw validationError("mixed_hosted_fields_mode", "tokenizeRecipientCard() uses only the cardNumber Element; do not create card, cardExpiry or cardCvv Elements on this instance.");
    }
    const cardNumber = this.elementMap.get("cardNumber");
    if (!cardNumber) {
      throw validationError("incomplete_elements", "Create a cardNumber Element before tokenizeRecipientCard()");
    }
    if (!cardNumber.isReady()) {
      throw validationError("elements_not_ready", "Wait for the cardNumber Element to fire 'ready' before tokenizeRecipientCard()");
    }

    this.tokenizeInFlight = true;
    try {
      return await this.doTokenizeRecipient(cardNumber, setupId, timeoutMs);
    } finally {
      this.tokenizeInFlight = false;
    }
  }

  private doTokenizeRecipient(
    cardNumber: Element,
    setupId: string,
    timeoutMs: number,
  ): Promise<RecipientCardResult> {
    const iframeOrigin = new URL(this.iframeBase).origin;
    const iframeWindow = cardNumber.getIframeContentWindow();
    if (!iframeWindow) {
      return Promise.reject(
        validationError("iframe_not_loaded", "tokenizeRecipientCard() cannot start because the cardNumber iframe is not loaded"),
      );
    }

    return new Promise<RecipientCardResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(tokenizeTimeoutError("tokenizeRecipientCard()", timeoutMs));
      }, timeoutMs);

      const onMessage = (event: MessageEvent) => {
        const data = parseIncoming<IframeToParent>(event, iframeOrigin);
        if (!data) return;
        const channelId = "channelId" in data ? data.channelId : undefined;
        if (typeof channelId !== "string" || channelId !== this.channelId) return;
        if (event.source !== iframeWindow) return;

        if (data.type === "arcpay:recipient-result") {
          if (data.setupId !== setupId) return;
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          resolve({
            setupId: data.setupId,
            cardTokenId: data.cardTokenId,
            cardMask: data.cardMask,
            cardScheme: data.cardScheme,
            ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
          });
        } else if (data.type === "arcpay:tokenize-error") {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          reject(bridgeError(data));
        }
      };

      window.addEventListener("message", onMessage);
      try {
        cardNumber.send({ type: "arcpay:tokenize-recipient", setupId });
      } catch (error) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        reject(error);
      }
    });
  }

  destroy(): void {
    for (const el of this.elementMap.values()) {
      el.destroy();
    }
    this.elementMap.clear();
  }
}
