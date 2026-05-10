import { ArcPayError } from "../core/errors";
import { Element, type ElementContext, type ElementOptions } from "./element";
import type { FieldType, IframeToParent } from "./postmessage";
import { parseIncoming } from "./postmessage";
import type { TokenizeResult } from "../tokenize/tokenize";

export type { TokenizeResult };

export interface ElementsOptions {
  iframeBase?: string;
}

const DEFAULT_IFRAME_BASE = "https://js.arcpay.space";

export class Elements {
  private readonly elementMap = new Map<FieldType, Element>();
  private readonly iframeBase: string;
  private readonly publishableKey: string;
  private tokenizeInFlight = false;

  constructor(opts: { publishableKey: string; iframeBase?: string }) {
    this.publishableKey = opts.publishableKey;
    this.iframeBase = opts.iframeBase ?? DEFAULT_IFRAME_BASE;
  }

  create(field: FieldType, options: ElementOptions = {}): Element {
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
    };
    const element = new Element(field, options, ctx);
    this.elementMap.set(field, element);
    return element;
  }

  async tokenize(paymentId: string, idempotencyKey: string): Promise<TokenizeResult> {
    // C2: concurrent-call guard — only one tokenize() may be in-flight at a time.
    if (this.tokenizeInFlight) {
      throw new ArcPayError({
        type: "validation_error",
        code: "tokenize_in_progress",
        message: "A tokenize() call is already in progress for this Elements instance",
        retryable: false,
      });
    }

    const cardNumber = this.elementMap.get("cardNumber");
    const cardExpiry = this.elementMap.get("cardExpiry");
    const cardCvv = this.elementMap.get("cardCvv");

    if (!cardNumber || !cardExpiry || !cardCvv) {
      throw new ArcPayError({
        type: "validation_error",
        code: "incomplete_elements",
        message:
          "All three elements (cardNumber, cardExpiry, cardCvv) must be created and mounted before tokenize()",
        retryable: false,
      });
    }
    if (!cardNumber.isReady() || !cardExpiry.isReady() || !cardCvv.isReady()) {
      throw new ArcPayError({
        type: "validation_error",
        code: "elements_not_ready",
        message: "Wait for all elements to fire 'ready' event before tokenize()",
        retryable: false,
      });
    }

    this.tokenizeInFlight = true;
    try {
      return await this.doTokenize(cardNumber, paymentId, idempotencyKey);
    } finally {
      this.tokenizeInFlight = false;
    }
  }

  private doTokenize(
    cardNumber: Element,
    paymentId: string,
    idempotencyKey: string,
  ): Promise<TokenizeResult> {
    const iframeOrigin = new URL(this.iframeBase).origin;
    // C1: obtain reference to the cardNumber iframe's contentWindow before
    // registering the listener so we can filter by source.
    const cardIframeWindow = cardNumber.getIframeContentWindow();

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
        // C1: source guard — only accept messages from the cardNumber iframe.
        if (cardIframeWindow !== null && event.source !== cardIframeWindow) return;
        // C4: use parseIncoming for origin + arcpay: prefix guard.
        const data = parseIncoming<IframeToParent>(event, iframeOrigin);
        if (!data) return;

        if (data.type === "arcpay:tokenize-result") {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          resolve({
            cardTokenId: data.cardTokenId,
            cardMask: data.cardMask,
            cardScheme: data.cardScheme,
            cardBin: data.cardBin,
            expiresAt: data.expiresAt,
          });
        } else if (data.type === "arcpay:tokenize-error") {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          const errType =
            data.errorType === "validation_error" || data.errorType === "api_error"
              ? data.errorType
              : "api_error";
          reject(
            new ArcPayError({
              type: errType,
              code: data.code,
              message: data.message,
              retryable: false,
              paymentId,
            }),
          );
        }
      };

      window.addEventListener("message", onMessage);
      cardNumber.send({ type: "arcpay:tokenize", paymentId, idempotencyKey });
    });
  }

  destroy(): void {
    for (const el of this.elementMap.values()) {
      el.destroy();
    }
    this.elementMap.clear();
  }
}
