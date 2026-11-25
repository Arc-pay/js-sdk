import { validationError } from "../core/errors";
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
import {
  pickRuntimeOptions,
  sanitizeRuntimeOptions,
  type HostedFieldsRuntimeOptions,
} from "./options";

const MIN_HEIGHT = /^\d{1,4}(\.\d{1,2})?(px|rem|em|vh|svh|dvh)$/;

export interface ElementOptions extends HostedFieldsRuntimeOptions {
  /** Iframe-safe input appearance. Container layout remains merchant-owned CSS. */
  appearance?: HostedFieldsAppearance;
  /** Minimum iframe height, e.g. "48px" or "3rem". Default "44px". */
  minHeight?: string;
  /**
   * How long to wait for the secure iframe handshake before emitting `loaderror`
   * (`iframe_ready_timeout`). Default 10000, range 3000-120000. Raise it for slow networks.
   */
  mountTimeoutMs?: number;
  /** Accessible label for the merchant-owned field group and secure iframe. */
  label?: string;
  /** IDs for helper and error text owned by the merchant page. */
  describedBy?: string;
  placeholder?: string;
}

export type ElementEvent =
  | { type: "loading"; field: FieldType }
  | { type: "ready"; field: FieldType }
  | { type: "submit"; field: FieldType }
  | { type: "escape"; field: FieldType }
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
  card: "Arc Pay secure card details",
  cardNumber: "Arc Pay secure card number",
  cardExpiry: "Arc Pay secure card expiry",
  cardCvv: "Arc Pay secure card security code",
};

const MOUNT_TIMEOUT_MS = 10000;
const MIN_MOUNT_TIMEOUT_MS = 3000;
const MAX_MOUNT_TIMEOUT_MS = 120000;
const HELLO_RETRY_INTERVAL_MS = 250;
const FIELD_MIN_HEIGHT: Record<FieldType, string> = {
  card: "44px",
  cardNumber: "44px",
  cardExpiry: "44px",
  cardCvv: "44px",
};

// A throwing listener must not break SDK state.
export function emitSafely<E>(listeners: Iterable<(event: E) => void>, event: E): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      (globalThis.reportError ?? console.error)(error);
    }
  }
}

function assertMinHeight(value: string | undefined): void {
  if (value === undefined || MIN_HEIGHT.test(value.trim())) return;
  throw validationError("invalid_hosted_fields_option", "minHeight must be a number with px, rem, em, vh, svh or dvh");
}

function assertMountTimeout(value: number | undefined): void {
  if (
    value === undefined ||
    (Number.isInteger(value) && value >= MIN_MOUNT_TIMEOUT_MS && value <= MAX_MOUNT_TIMEOUT_MS)
  ) {
    return;
  }
  throw validationError("invalid_hosted_fields_option", `mountTimeoutMs must be an integer between ${MIN_MOUNT_TIMEOUT_MS} and ${MAX_MOUNT_TIMEOUT_MS}`);
}

function runtimeOptionsOf(options: object): HostedFieldsRuntimeOptions {
  return sanitizeRuntimeOptions(pickRuntimeOptions(options), { strict: true });
}

function accessibleLabel(field: FieldType, options: ElementOptions): string {
  return options.label?.trim() || FIELD_TITLES[field];
}

export interface ElementContext {
  iframeBase: string;
  publishableKey: string;
  channelId: string;
}

export class Element {
  private iframe: HTMLIFrameElement | null = null;
  private readonly listeners: Record<ElementEventName, Set<Listener>> = {
    loading: new Set<Listener>(),
    submit: new Set<Listener>(),
    escape: new Set<Listener>(),
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
  private helloTimer: number | null = null;

  constructor(
    public readonly field: FieldType,
    private options: ElementOptions,
    private readonly context: ElementContext,
  ) {
    assertMinHeight(options.minHeight);
    assertMountTimeout(options.mountTimeoutMs);
    runtimeOptionsOf(options);
    // Validate the appearance now: an unsupported theme used to surface only as an uncaught
    // exception during the handshake and a silent 10 s wait for `loaderror`.
    buildStyleFromAppearance(options.appearance);
  }

  /** Internal: used by Elements for autoAdvance. */
  get autoAdvance(): boolean {
    return this.options.autoAdvance === true;
  }

  mount(target: string | HTMLElement): void {
    if (this.iframe) {
      throw validationError("already_mounted", `Element ${this.field} is already mounted`);
    }
    const container = typeof target === "string" ? document.querySelector(target) : target;
    if (!(container instanceof HTMLElement)) {
      throw validationError("mount_target_not_found", `mount target not found: ${String(target)}`);
    }

    const iframe = document.createElement("iframe");
    const iframeURL = new URL(`/iframe/${this.field}`, this.context.iframeBase);
    iframeURL.searchParams.set("parent_origin", window.location.origin);
    iframeURL.searchParams.set("publishable_key", this.context.publishableKey);
    iframe.src = iframeURL.toString();
    iframe.style.cssText = `border:0;width:100%;height:100%;min-height:${this.options.minHeight?.trim() ?? FIELD_MIN_HEIGHT[this.field]};display:block;`;
    iframe.setAttribute("allow", "payment");
    iframe.setAttribute("data-arcpay-element", this.field);
    iframe.setAttribute("title", accessibleLabel(this.field, this.options));
    iframe.setAttribute("aria-label", accessibleLabel(this.field, this.options));
    if (this.options.describedBy) {
      iframe.setAttribute("aria-describedby", this.options.describedBy);
    }
    if (this.options.label && !container.getAttribute("role")) {
      container.setAttribute("role", "group");
      container.setAttribute("aria-label", this.options.label);
    }
    if (this.options.describedBy && !container.getAttribute("aria-describedby")) {
      container.setAttribute("aria-describedby", this.options.describedBy);
    }
    container.appendChild(iframe);
    this.iframe = iframe;
    this.emit({ type: "loading", field: this.field });

    const expectedOrigin = new URL(this.context.iframeBase).origin;

    this.messageHandler = (event: MessageEvent) => {
      // C4: use parseIncoming for origin + arcpay: prefix guard.
      const data = parseIncoming<IframeToParent>(event, expectedOrigin);
      if (!data) return;
      if (!this.acceptsIframeMessage(event, data)) return;
      this.handleMessage(data);
    };
    window.addEventListener("message", this.messageHandler);
    this.mountTimer = window.setTimeout(() => {
      if (this.status !== "pending") return;
      this.status = "error";
      this.clearHelloTimer();
      this.emit({
        type: "loaderror",
        field: this.field,
        code: "iframe_ready_timeout",
        reason: "Element iframe did not finish the Arc Pay handshake",
        retryable: true,
      });
    }, this.options.mountTimeoutMs ?? MOUNT_TIMEOUT_MS);

    iframe.addEventListener(
      "load",
      () => {
        this.startHelloHandshake(expectedOrigin);
      },
      { once: true },
    );
  }

  private handleMessage(data: IframeToParent): void {
    if (data.type === "arcpay:ready") {
      if (this.status !== "pending") return;
      this.clearHelloTimer();
      const runtime = runtimeOptionsOf(this.options);
      this.send({
        type: "arcpay:configure",
        field: this.field,
        payload: buildStyleFromAppearance(this.options.appearance),
        ...("placeholder" in this.options ? { placeholder: this.options.placeholder ?? "" } : {}),
        ...(Object.keys(runtime).length > 0 ? { options: runtime } : {}),
      });
    } else if (data.type === "arcpay:configured") {
      if (this.status !== "pending") return;
      this.status = "ready";
      this.clearMountTimer();
      this.clearHelloTimer();
      this.emit({ type: "ready", field: this.field });
    } else if (data.type === "arcpay:rejected") {
      this.status = "error";
      this.clearMountTimer();
      this.clearHelloTimer();
      this.emit({
        type: "error",
        field: this.field,
        code: data.code ?? "iframe_rejected",
        reason: data.reason,
        retryable: data.retryable ?? false,
      });
    } else if (data.type === "arcpay:focus" && data.field === this.field) {
      this.emit({ type: "focus", field: this.field, help: data.help });
    } else if (data.type === "arcpay:submit" && data.field === this.field) {
      this.emit({ type: "submit", field: this.field });
    } else if (data.type === "arcpay:escape" && data.field === this.field) {
      this.emit({ type: "escape", field: this.field });
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

  update(options: Partial<ElementOptions>): void {
    assertMinHeight(options.minHeight);
    assertMountTimeout(options.mountTimeoutMs);
    const style = "appearance" in options ? buildStyleFromAppearance(options.appearance) : undefined;
    const runtimeUpdate = runtimeOptionsOf(options);
    if (style || "placeholder" in options || Object.keys(runtimeUpdate).length) {
      this.assertMounted();
    }
    this.options = { ...this.options, ...options };
    if (this.iframe && options.minHeight !== undefined) {
      this.iframe.style.minHeight = options.minHeight.trim();
    }
    if (Object.keys(runtimeUpdate).length > 0) {
      this.send({ type: "arcpay:options", options: runtimeUpdate });
    }
    if (this.iframe && "label" in options) {
      this.iframe.setAttribute("title", accessibleLabel(this.field, this.options));
      this.iframe.setAttribute("aria-label", accessibleLabel(this.field, this.options));
    }
    if (this.iframe && "describedBy" in options) {
      if (this.options.describedBy) {
        this.iframe.setAttribute("aria-describedby", this.options.describedBy);
      } else {
        this.iframe.removeAttribute("aria-describedby");
      }
    }
    if (style) this.send({ type: "arcpay:style", payload: style });
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
    this.clearHelloTimer();
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

  acceptsIframeMessage(event: MessageEvent, data: IframeToParent): boolean {
    const channelId = "channelId" in data ? data.channelId : undefined;
    if (typeof channelId !== "string" || channelId !== this.context.channelId) return false;

    const field = "field" in data ? data.field : undefined;
    if (typeof field !== "string" || field !== this.field) return false;

    return event.source === this.iframe?.contentWindow;
  }

  /** Internal: used by Elements factory to send tokenize commands. */
  send(message: ParentToIframe, transfer?: Transferable[]): void {
    this.assertMounted();
    postToIframe(this.iframe!, message, new URL(this.context.iframeBase).origin, transfer);
  }

  private assertMounted(): void {
    if (!this.iframe) {
      throw validationError("not_mounted", `Element ${this.field} is not mounted`);
    }
  }

  private emit(event: ElementEvent): void {
    emitSafely(this.listeners[event.type], event);
  }

  private startHelloHandshake(expectedOrigin: string): void {
    const sendHello = () => {
      if (!this.iframe || this.status !== "pending") {
        this.clearHelloTimer();
        return;
      }
      const hello: ParentToIframe = {
        type: "arcpay:hello",
        origin: window.location.origin,
        publishableKey: this.context.publishableKey,
        channelId: this.context.channelId,
      };
      postToIframe(this.iframe, hello, expectedOrigin);
    };

    this.clearHelloTimer();
    sendHello();
    if (this.status !== "pending") return;
    this.helloTimer = window.setInterval(sendHello, HELLO_RETRY_INTERVAL_MS);
  }

  private clearMountTimer(): void {
    if (!this.mountTimer) return;
    window.clearTimeout(this.mountTimer);
    this.mountTimer = null;
  }

  private clearHelloTimer(): void {
    if (!this.helloTimer) return;
    window.clearInterval(this.helloTimer);
    this.helloTimer = null;
  }
}
