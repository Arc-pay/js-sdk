import { ArcPayError } from "../core/errors";
import { Element, type ElementContext, type ElementOptions } from "./element";
import type { FieldType, IframeToParent, SplitFieldType } from "./postmessage";
import { parseIncoming } from "./postmessage";
import type { TokenizeResult } from "../tokenize/tokenize";
import type { HostedFieldsAppearance } from "./style";

export type {};

export interface ElementsOptions {
  /** Default iframe-safe input appearance applied to elements created by this factory. */
  appearance?: HostedFieldsAppearance;
}

const DEFAULT_IFRAME_BASE = "https://sdk.arcpay.space";
const SPLIT_FIELDS = [
  "cardNumber",
  "cardExpiry",
  "cardCvv",
] as const satisfies readonly SplitFieldType[];

const createChannelId = (): string => {
  if (!globalThis.crypto?.randomUUID) {
    throw new ArcPayError({
      type: "validation_error",
      code: "crypto_unavailable",
      message: "crypto.randomUUID is required for Hosted Fields",
      retryable: false,
    });
  }
  return globalThis.crypto.randomUUID();
};

const assertNonEmptyTokenizeInput = (
  name: "paymentId" | "idempotencyKey",
  value: unknown,
): void => {
  if (typeof value === "string" && value.trim().length > 0) return;
  throw new ArcPayError({
    type: "validation_error",
    code: name === "paymentId" ? "missing_payment_id" : "missing_idempotency_key",
    message: `${name} must be a non-empty string`,
    retryable: false,
  });
};

export class Elements {
  private readonly elementMap = new Map<FieldType, Element>();
  private readonly iframeBase: string;
  private readonly publishableKey: string;
  private readonly channelId: string;
  private tokenizeInFlight = false;
  private readonly appearance?: HostedFieldsAppearance;

  constructor(opts: {
    publishableKey: string;
    iframeBase?: string;
    appearance?: HostedFieldsAppearance;
  }) {
    this.publishableKey = opts.publishableKey;
    this.iframeBase = opts.iframeBase ?? DEFAULT_IFRAME_BASE;
    this.channelId = createChannelId();
    this.appearance = opts.appearance;
  }

  create(field: FieldType, options: ElementOptions = {}): Element {
    if (field === "card" && SPLIT_FIELDS.some((splitField) => this.elementMap.has(splitField))) {
      throw new ArcPayError({
        type: "validation_error",
        code: "mixed_hosted_fields_mode",
        message:
          "Use either the composite card Element or split cardNumber/cardExpiry/cardCvv Elements, not both.",
        retryable: false,
      });
    }
    if (field !== "card" && this.elementMap.has("card")) {
      throw new ArcPayError({
        type: "validation_error",
        code: "mixed_hosted_fields_mode",
        message:
          "Use either the composite card Element or split cardNumber/cardExpiry/cardCvv Elements, not both.",
        retryable: false,
      });
    }
    if (this.elementMap.has(field)) {
      throw new ArcPayError({
        type: "validation_error",
        code: "duplicate_element",
        message: `Element for ${field} already created`,
        retryable: false,
      });
    }
    const ctx: ElementContext = {
      iframeBase: this.iframeBase,
      publishableKey: this.publishableKey,
      channelId: this.channelId,
    };
    const element = new Element(
      field,
      {
        ...options,
        appearance: options.appearance ?? this.appearance,
      },
      ctx,
    );
    this.elementMap.set(field, element);
    return element;
  }

  async tokenize(paymentId: string, idempotencyKey: string): Promise<TokenizeResult> {
    assertNonEmptyTokenizeInput("paymentId", paymentId);
    assertNonEmptyTokenizeInput("idempotencyKey", idempotencyKey);

    // C2: concurrent-call guard — only one tokenize() may be in-flight at a time.
    if (this.tokenizeInFlight) {
      throw new ArcPayError({
        type: "validation_error",
        code: "tokenize_in_progress",
        message: "A tokenize() call is already in progress for this Elements instance",
        retryable: false,
      });
    }

    const card = this.elementMap.get("card");
    const splitCardNumber = this.elementMap.get("cardNumber");

    if (!card && !splitCardNumber) {
      throw new ArcPayError({
        type: "validation_error",
        code: "incomplete_elements",
        message:
          "Create either a secure card Element or split cardNumber/cardExpiry/cardCvv Elements before tokenize()",
        retryable: false,
      });
    }
    const tokenizeElement = card ?? splitCardNumber;
    if (!tokenizeElement) {
      throw new ArcPayError({
        type: "validation_error",
        code: "incomplete_elements",
        message:
          "Create either a secure card Element or split cardNumber/cardExpiry/cardCvv Elements before tokenize()",
        retryable: false,
      });
    }
    if (!tokenizeElement.isReady()) {
      throw new ArcPayError({
        type: "validation_error",
        code: "elements_not_ready",
        message: "Wait for all secure card fields to fire 'ready' before tokenize()",
        retryable: false,
      });
    }
    if (!card) {
      for (const splitField of SPLIT_FIELDS) {
        const element = this.elementMap.get(splitField);
        if (!element) {
          throw new ArcPayError({
            type: "validation_error",
            code: "incomplete_elements",
            message:
              "Split Hosted Fields require cardNumber, cardExpiry, and cardCvv before tokenize()",
            retryable: false,
          });
        }
        if (!element.isReady()) {
          throw new ArcPayError({
            type: "validation_error",
            code: "elements_not_ready",
            message: "Wait for all secure card fields to fire 'ready' before tokenize()",
            retryable: false,
          });
        }
      }
    }

    this.tokenizeInFlight = true;
    try {
      return await this.doTokenize(tokenizeElement, paymentId, idempotencyKey);
    } finally {
      this.tokenizeInFlight = false;
    }
  }

  private doTokenize(
    card: Element,
    paymentId: string,
    idempotencyKey: string,
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
      // C3: 30-second timeout — rejects and cleans up if no result arrives.
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(
          new ArcPayError({
            type: "network_error",
            code: "tokenize_timeout",
            message: "tokenize() timed out after 30 seconds",
            retryable: true,
            paymentId,
          }),
        );
      }, 30_000);

      const onMessage = (event: MessageEvent) => {
        // C4: use parseIncoming for origin + arcpay: prefix guard.
        const data = parseIncoming<IframeToParent>(event, iframeOrigin);
        if (!data) return;
        const channelId = "channelId" in data ? data.channelId : undefined;
        if (typeof channelId === "string" && channelId !== this.channelId) return;
        if (typeof channelId !== "string" && event.source !== cardIframeWindow) return;

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
          reject(
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
            }),
          );
        }
      };

      window.addEventListener("message", onMessage);
      this.connectSplitValuePorts(card);
      card.send({ type: "arcpay:tokenize", paymentId, idempotencyKey });
    });
  }

  private connectSplitValuePorts(collector: Element): void {
    if (collector.field !== "cardNumber" || typeof MessageChannel === "undefined") return;

    for (const field of SPLIT_FIELDS) {
      if (field === "cardNumber") continue;
      const responder = this.elementMap.get(field);
      if (!responder) continue;

      const channel = new MessageChannel();
      const requestId = createChannelId();
      collector.send(
        {
          type: "arcpay:split-value-port",
          role: "collector",
          requestId,
          field,
        },
        [channel.port1],
      );
      responder.send(
        {
          type: "arcpay:split-value-port",
          role: "responder",
          requestId,
          field,
        },
        [channel.port2],
      );
    }
  }

  destroy(): void {
    for (const el of this.elementMap.values()) {
      el.destroy();
    }
    this.elementMap.clear();
  }
}
