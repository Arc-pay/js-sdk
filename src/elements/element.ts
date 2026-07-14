import { ArcPayError } from "../core/errors";
import {
  type FieldType,
  type ParentToIframe,
  type IframeToParent,
  type HostedFieldHelp,
  type HostedFieldIssue,
  postToIframe,
  parseIncoming,
} from "./postmessage";
import { buildStyleFromAppearance, type HostedFieldsAppearance } from "./style";

export interface ElementOptions {
  /** Iframe-safe input appearance. Container layout remains merchant-owned CSS. */
  appearance?: HostedFieldsAppearance;
  placeholder?: string;
}

export type ElementEvent =
  | { type: "ready"; field: FieldType }
  | {
      type: "change";
      field: FieldType;
      isValid: boolean;
      isEmpty: boolean;
      isComplete: boolean;
      brand?: string;
      lastFour?: string;
      issue: HostedFieldIssue | null;
      help: HostedFieldHelp | null;
    }
  | { type: "focus"; field: FieldType; help: HostedFieldHelp | null }
  | { type: "blur"; field: FieldType; issue: HostedFieldIssue | null }
  | { type: "error"; field: FieldType; code: string; reason: string; retryable: boolean }
  | { type: "loaderror"; field: FieldType; code: string; reason: string; retryable: boolean };

type Listener = (event: ElementEvent) => void;
type ElementEventName = ElementEvent["type"];

const FIELD_TITLES: Record<FieldType, string> = {
  cardNumber: "Arc Pay card number",
  cardExpiry: "Arc Pay card expiration date",
  cardCvv: "Arc Pay card security code",
};

const MOUNT_TIMEOUT_MS = 10000;

export interface ElementContext {
  iframeBase: string;
  publishableKey: string;
  channelId: string;
}

export class Element {
  private iframe: HTMLIFrameElement | null = null;
  private readonly listeners: Record<ElementEventName, Set<Listener>> = {
    ready: new Set<Listener>(),
    change: new Set<Listener>(),
    focus: new Set<Listener>(),
    blur: new Set<Listener>(),
    error: new Set<Listener>(),
    loaderror: new Set<Listener>(),
  };
  private status: "pending" | "ready" | "error" = "pending";
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private mountTimer: number | null = null;

  constructor(
    public readonly field: FieldType,
    private readonly options: ElementOptions,
    private readonly context: ElementContext,
  ) {}

  mount(target: string | HTMLElement): void {
    if (this.iframe) {
      throw new ArcPayError({
        type: "validation_error",
        code: "already_mounted",
        message: `Element ${this.field} is already mounted`,
        retryable: false,
      });
    }
    const container = typeof target === "string" ? document.querySelector(target) : target;
    if (!(container instanceof HTMLElement)) {
      throw new ArcPayError({
        type: "validation_error",
        code: "mount_target_not_found",
        message: `mount target not found: ${String(target)}`,
        retryable: false,
      });
    }

    const iframe = document.createElement("iframe");
    iframe.src = `${this.context.iframeBase}/iframe/${this.field}`;
    iframe.style.cssText = "border:0;width:100%;height:100%;display:block;";
    iframe.setAttribute("allow", "payment");
    iframe.setAttribute("data-arcpay-element", this.field);
    iframe.setAttribute("title", FIELD_TITLES[this.field]);
    iframe.setAttribute("aria-label", FIELD_TITLES[this.field]);
    container.appendChild(iframe);
    this.iframe = iframe;

    const expectedOrigin = new URL(this.context.iframeBase).origin;

    this.messageHandler = (event: MessageEvent) => {
      // C1: source guard — only accept messages from this element's own iframe.
      // Without this, any iframe at the same origin (e.g. cardExpiry, cardCvv)
      // could trigger handlers on cardNumber and vice-versa.
      if (event.source !== this.iframe?.contentWindow) return;
      // C4: use parseIncoming for origin + arcpay: prefix guard.
      const data = parseIncoming<IframeToParent>(event, expectedOrigin);
      if (!data) return;
      this.handleMessage(data);
    };
    window.addEventListener("message", this.messageHandler);
    this.mountTimer = window.setTimeout(() => {
      if (this.status !== "pending") return;
      this.status = "error";
      this.emit({
        type: "loaderror",
        field: this.field,
        code: "iframe_ready_timeout",
        reason: "Element iframe did not finish the Arc Pay handshake",
        retryable: true,
      });
    }, MOUNT_TIMEOUT_MS);

    iframe.addEventListener(
      "load",
      () => {
        if (!this.iframe) return;
        const hello: ParentToIframe = {
          type: "arcpay:hello",
          origin: window.location.origin,
          publishableKey: this.context.publishableKey,
          channelId: this.context.channelId,
        };
        postToIframe(this.iframe, hello, expectedOrigin);
      },
      { once: true },
    );
  }

  private handleMessage(data: IframeToParent): void {
    if (data.type === "arcpay:ready") {
      if (this.status !== "pending") return;
      this.send({
        type: "arcpay:configure",
        field: this.field,
        payload: buildStyleFromAppearance(this.options.appearance),
        ...("placeholder" in this.options ? { placeholder: this.options.placeholder ?? "" } : {}),
      });
    } else if (data.type === "arcpay:configured") {
      if (this.status !== "pending") return;
      this.status = "ready";
      this.clearMountTimer();
      this.emit({ type: "ready", field: this.field });
    } else if (data.type === "arcpay:rejected") {
      this.status = "error";
      this.clearMountTimer();
      this.emit({
        type: "error",
        field: this.field,
        code: data.code ?? "iframe_rejected",
        reason: data.reason,
        retryable: data.retryable ?? false,
      });
    } else if (data.type === "arcpay:focus" && data.field === this.field) {
      this.emit({ type: "focus", field: this.field, help: data.help });
    } else if (data.type === "arcpay:blur" && data.field === this.field) {
      this.emit({ type: "blur", field: this.field, issue: data.issue });
    } else if (data.type === "arcpay:change" && data.field === this.field) {
      this.emit({
        type: "change",
        field: this.field,
        isValid: data.isValid,
        isEmpty: data.isEmpty,
        isComplete: data.isComplete,
        brand: data.brand,
        lastFour: data.lastFour,
        issue: data.issue,
        help: data.help,
      });
    }
    // arcpay:tokenize-result / arcpay:tokenize-error handled by Elements factory (Task 9).
  }

  update(options: { appearance?: HostedFieldsAppearance; placeholder?: string }): void {
    if ("appearance" in options) {
      this.send({
        type: "arcpay:style",
        payload: buildStyleFromAppearance(options.appearance),
      });
    }
    if ("placeholder" in options) {
      this.send({
        type: "arcpay:placeholder",
        field: this.field,
        placeholder: options.placeholder ?? "",
      });
    }
  }

  destroy(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.clearMountTimer();
    for (const listeners of Object.values(this.listeners)) {
      listeners.clear();
    }
    this.status = "pending";
  }

  on(event: ElementEventName, callback: Listener): () => void {
    this.listeners[event].add(callback);
    return () => this.listeners[event].delete(callback);
  }

  focus(): void {
    this.send({ type: "arcpay:focus" });
  }

  clear(): void {
    this.send({ type: "arcpay:clear" });
  }

  isReady(): boolean {
    return this.status === "ready";
  }

  /**
   * Internal: returns the iframe's contentWindow for source-filtering in
   * Elements.doTokenize(). Returns null when the iframe is not yet mounted
   * or the browser has not exposed contentWindow. Callers must fail closed.
   */
  getIframeContentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null;
  }

  /** Internal: used by Elements factory to send tokenize commands. */
  send(message: ParentToIframe): void {
    if (!this.iframe) {
      throw new ArcPayError({
        type: "validation_error",
        code: "not_mounted",
        message: `Element ${this.field} is not mounted`,
        retryable: false,
      });
    }
    postToIframe(this.iframe, message, new URL(this.context.iframeBase).origin);
  }

  private emit(event: ElementEvent): void {
    for (const listener of this.listeners[event.type]) {
      listener(event);
    }
  }

  private clearMountTimer(): void {
    if (!this.mountTimer) return;
    window.clearTimeout(this.mountTimer);
    this.mountTimer = null;
  }
}
