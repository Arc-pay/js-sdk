import { ArcPayError, type ArcPayErrorType } from "../core/errors";
import type {
  AvailablePaymentMethod,
  CaptureRequest,
  ChargeSavedCardRequest,
  CheckoutSession,
  CompleteThreeDSMethodRequest,
  CreateCheckoutSessionRequest,
  CreateCardSetupRequest,
  CreateLinkRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  Link,
  ListAvailablePaymentMethodsQuery,
  ListPaymentsQuery,
  Payment,
  PaymentList,
  PaymentNextAction,
  Refund,
  TerminalPaymentStatus,
  VoidRequest,
  WaitForPaymentOptions,
} from "./types";

export type {
  AvailablePaymentMethod,
  CaptureMode,
  CaptureRequest,
  ChargeSavedCardRequest,
  CheckoutSession,
  CompleteThreeDSMethodRequest,
  CreateCheckoutSessionRequest,
  CreateCardSetupRequest,
  CreateLinkRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  Currency,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  PaymentNextAction,
  Link,
  ListAvailablePaymentMethodsQuery,
  ListPaymentsQuery,
  Payment,
  PaymentFlowMode,
  PaymentList,
  PaymentMethod,
  PaymentStatus,
  TerminalPaymentStatus,
  Refund,
  VoidRequest,
  WaitForPaymentOptions,
} from "./types";

export interface ArcPayClientOptions {
  secretKey: string;
  apiBase?: string;
  fetch?: typeof fetch;
}

export interface IdempotencyOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
}

type RequestOptionsInput = RequestOptions | IdempotencyOptions | null | undefined;

export interface RequestOptions {
  signal?: AbortSignal;
}

const DEFAULT_API_BASE = "https://api.arcpay.space/v1";
const API_VERSION = "2026-05-06";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const DEFAULT_TERMINAL_PAYMENT_STATUSES: readonly TerminalPaymentStatus[] = [
  "authorized",
  "captured",
  "settled",
  "voided",
  "expired",
  "refunded",
  "chargeback",
  "declined",
  "failed",
];

function validateSecretKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length === 0) {
    throw new ArcPayError({
      type: "authentication_error",
      code: "invalid_secret_key",
      message: "Secret key must be a non-empty string",
      retryable: false,
    });
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new ArcPayError({
      type: "authentication_error",
      code: "invalid_secret_key",
      message:
        "Secret key must start with sk_test_ or sk_live_. Publishable keys cannot call server APIs.",
      retryable: false,
    });
  }
}

const normalizeBase = (base: string): string => {
  let end = base.length;
  while (end > 0 && base.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return base.slice(0, end);
};

interface RequestOptionsWithOptionalIdempotency extends RequestOptions {
  idempotencyKey?: string;
}

const normalizeRequestOptions = (
  opts: RequestOptionsInput,
): RequestOptionsWithOptionalIdempotency => opts ?? {};

const IDEMPOTENCY_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireIdempotencyKey = (opts: RequestOptionsWithOptionalIdempotency): string => {
  if (!opts.idempotencyKey) {
    throw new ArcPayError({
      type: "validation_error",
      code: "missing_idempotency_key",
      message: "idempotencyKey is required for this operation",
      retryable: false,
    });
  }
  if (!IDEMPOTENCY_KEY_RE.test(opts.idempotencyKey)) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_idempotency_key",
      message: "idempotencyKey must be a valid UUID",
      retryable: false,
    });
  }
  return opts.idempotencyKey;
};

const normalizeExecutePaymentRequest = (body: ExecutePaymentRequest): ExecutePaymentRequest => {
  if (!body || !body.card_token_id) {
    throw new ArcPayError({
      type: "validation_error",
      code: "missing_card_token_id",
      message: "card_token_id is required",
      retryable: false,
    });
  }
  const paymentMode = body.payment_mode ?? "h2h";
  if (paymentMode !== "h2h") {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_payment_mode",
      message: "payment_mode must be h2h for executePayment",
      retryable: false,
    });
  }
  return { ...body, payment_mode: paymentMode };
};

const appendQuery = (path: string, query?: object): string => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("The operation was aborted", "AbortError"));
      },
      { once: true },
    );
  });

const normalizePollMs = (value: number | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_poll_options",
      message: "Polling intervals and timeouts must be positive finite numbers",
      retryable: false,
    });
  }
  return value;
};

interface APIErrorBody {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
    request_id?: string;
    decline_code?: string;
  };
}

const isPublicErrorType = (value: unknown): value is ArcPayErrorType =>
  value === "validation_error" ||
  value === "authentication_error" ||
  value === "authorization_error" ||
  value === "state_error" ||
  value === "rate_limit_error" ||
  value === "api_error";

const isRetryableError = (type: ArcPayErrorType, status: number, code?: string): boolean => {
  if (type === "rate_limit_error") return true;
  if (code === "timeout") return false;
  return type === "api_error" && status >= 500;
};

const parseErrorResponse = async (res: Response): Promise<ArcPayError> => {
  let body: APIErrorBody = {};
  try {
    body = (await res.json()) as APIErrorBody;
  } catch {
    /* keep default error below */
  }
  const detail = body.error ?? {};
  const type = isPublicErrorType(detail.type)
    ? detail.type
    : res.status >= 500
      ? "api_error"
      : "validation_error";
  return new ArcPayError({
    type,
    code: detail.code,
    message: detail.message ?? `Request failed with status ${res.status}`,
    param: detail.param,
    requestId: detail.request_id,
    declineCode: detail.decline_code,
    retryable: isRetryableError(type, res.status, detail.code),
  });
};

export class ArcPayClient {
  private readonly secretKey: string;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ArcPayClientOptions) {
    const secretKey: unknown = options.secretKey;
    validateSecretKey(secretKey);
    if (!options.fetch && typeof fetch === "undefined") {
      throw new ArcPayError({
        type: "api_error",
        code: "fetch_unavailable",
        message: "A fetch implementation is required in this runtime",
        retryable: false,
      });
    }
    this.secretKey = secretKey;
    this.apiBase = normalizeBase(options.apiBase ?? DEFAULT_API_BASE);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async listPayments(
    query: ListPaymentsQuery = {},
    opts: RequestOptions = {},
  ): Promise<PaymentList> {
    return this.request<PaymentList>("GET", appendQuery("/payments", query), undefined, opts);
  }

  async createPayment(body: CreatePaymentRequest, opts: IdempotencyOptions): Promise<Payment>;
  async createPayment(body: CreatePaymentRequest, opts: RequestOptionsInput): Promise<Payment> {
    return this.request<Payment>("POST", "/payments", body, opts, true);
  }

  async createCardSetup(body: CreateCardSetupRequest, opts: IdempotencyOptions): Promise<Payment>;
  async createCardSetup(body: CreateCardSetupRequest, opts: RequestOptionsInput): Promise<Payment> {
    return this.request<Payment>("POST", "/cards/setup", body, opts, true);
  }

  async getPayment(paymentId: string, opts: RequestOptions = {}): Promise<Payment> {
    return this.request<Payment>(
      "GET",
      `/payments/${encodeURIComponent(paymentId)}`,
      undefined,
      opts,
    );
  }

  async waitForPaymentTerminal(
    paymentId: string,
    opts: WaitForPaymentOptions = {},
  ): Promise<Payment> {
    const intervalMs = normalizePollMs(opts.intervalMs, DEFAULT_POLL_INTERVAL_MS);
    const timeoutMs = normalizePollMs(opts.timeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    const terminalStatuses = new Set(opts.terminalStatuses ?? DEFAULT_TERMINAL_PAYMENT_STATUSES);
    const startedAt = Date.now();

    for (;;) {
      const payment = await this.getPayment(paymentId, { signal: opts.signal });
      if (terminalStatuses.has(payment.status as TerminalPaymentStatus)) {
        return payment;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new ArcPayError({
          type: "api_error",
          code: "payment_poll_timeout",
          message: `Payment ${paymentId} did not reach a terminal status within ${timeoutMs}ms`,
          retryable: true,
        });
      }
      await sleep(intervalMs, opts.signal);
    }
  }

  async capturePayment(
    paymentId: string,
    body: CaptureRequest,
    opts: IdempotencyOptions,
  ): Promise<Payment>;
  async capturePayment(
    paymentId: string,
    body: CaptureRequest,
    opts: RequestOptionsInput,
  ): Promise<Payment> {
    return this.request<Payment>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      body,
      opts,
      true,
    );
  }

  async voidPayment(
    paymentId: string,
    body: VoidRequest,
    opts: IdempotencyOptions,
  ): Promise<Payment>;
  async voidPayment(
    paymentId: string,
    body: VoidRequest,
    opts: RequestOptionsInput,
  ): Promise<Payment> {
    return this.request<Payment>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/void`,
      body,
      opts,
      true,
    );
  }

  async createRefund(
    paymentId: string,
    body: CreateRefundRequest,
    opts: IdempotencyOptions,
  ): Promise<Refund>;
  async createRefund(
    paymentId: string,
    body: CreateRefundRequest,
    opts: RequestOptionsInput,
  ): Promise<Refund> {
    return this.request<Refund>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      body,
      opts,
      true,
    );
  }

  async chargeSavedCard(
    body: ChargeSavedCardRequest,
    opts: IdempotencyOptions,
  ): Promise<ExecutePaymentResponse>;
  async chargeSavedCard(
    body: ChargeSavedCardRequest,
    opts: RequestOptionsInput,
  ): Promise<ExecutePaymentResponse> {
    return this.request<ExecutePaymentResponse>("POST", "/payments/saved-card", body, opts, true);
  }

  async executePayment(
    paymentId: string,
    body: ExecutePaymentRequest,
    opts: IdempotencyOptions,
  ): Promise<ExecutePaymentResponse>;
  async executePayment(
    paymentId: string,
    body: ExecutePaymentRequest,
    opts: RequestOptionsInput,
  ): Promise<ExecutePaymentResponse> {
    const requestBody = normalizeExecutePaymentRequest(body);
    return this.request<ExecutePaymentResponse>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/execute`,
      requestBody,
      opts,
      true,
    );
  }

  async completeThreeDSMethod(
    paymentId: string,
    body: CompleteThreeDSMethodRequest,
    opts: RequestOptions = {},
  ): Promise<ExecutePaymentResponse> {
    return this.request<ExecutePaymentResponse>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/complete-3ds-method`,
      body,
      opts,
    );
  }

  async listAvailablePaymentMethods(
    query: ListAvailablePaymentMethodsQuery,
    opts: RequestOptions = {},
  ): Promise<AvailablePaymentMethod[]> {
    return this.request<AvailablePaymentMethod[]>(
      "GET",
      appendQuery("/payment-methods/available", query),
      undefined,
      opts,
    );
  }

  async createLink(body: CreateLinkRequest, opts: IdempotencyOptions): Promise<Link>;
  async createLink(body: CreateLinkRequest, opts: RequestOptionsInput): Promise<Link> {
    return this.request<Link>("POST", "/links", body, opts, true);
  }

  async getLink(linkId: string, opts: RequestOptions = {}): Promise<Link> {
    return this.request<Link>("GET", `/links/${encodeURIComponent(linkId)}`, undefined, opts);
  }

  async cancelLink(linkId: string, opts: RequestOptions = {}): Promise<Link> {
    return this.request<Link>("DELETE", `/links/${encodeURIComponent(linkId)}`, undefined, opts);
  }

  async createCheckoutSession(
    body: CreateCheckoutSessionRequest,
    opts: IdempotencyOptions,
  ): Promise<CheckoutSession>;
  async createCheckoutSession(
    body: CreateCheckoutSessionRequest,
    opts: RequestOptionsInput,
  ): Promise<CheckoutSession> {
    return this.request<CheckoutSession>("POST", "/checkout/sessions", body, opts, true);
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: unknown,
    opts: RequestOptionsInput = undefined,
    requireIdempotency = false,
  ): Promise<T> {
    const requestOpts = normalizeRequestOptions(opts);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "X-Arc-Pay-API-Version": API_VERSION,
      "Content-Type": "application/json",
    };
    if (requireIdempotency) {
      headers["Idempotency-Key"] = requireIdempotencyKey(requestOpts);
    } else if (requestOpts.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = requireIdempotencyKey(requestOpts);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestOpts.signal,
      });
    } catch (err) {
      throw new ArcPayError({
        type: "network_error",
        message: err instanceof Error ? err.message : "Network request failed",
        retryable: true,
      });
    }
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  }
}

export const createArcPayClient = (options: ArcPayClientOptions): ArcPayClient =>
  new ArcPayClient(options);
