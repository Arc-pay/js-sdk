import { ArcPayError, type ArcPayErrorType } from "../core/errors";
import { isIdempotencyKey } from "../core/idempotency";
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
  WaitForPaymentTerminalResult,
} from "./types";

export type {
  AvailablePaymentMethod,
  CaptureRequest,
  ChargeSavedCardRequest,
  CheckoutSession,
  CompleteThreeDSMethodRequest,
  CreateCheckoutSessionRequest,
  CreateLinkRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
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
  Refund,
  TerminalPaymentStatus,
  VoidRequest,
  WaitForPaymentOptions,
  WaitForPaymentTerminalResult,
} from "./types";

export interface ArcPayClientOptions {
  secretKey: string;
  apiBase?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxNetworkRetries?: number;
  retryDelayMs?: number | ((attempt: number, error: ArcPayError) => number);
}

export interface IdempotencyOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type RequestOptionsInput = RequestOptions | IdempotencyOptions | null | undefined;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_API_BASE = "https://api.arcpay.space/v1";
const API_VERSION = "2026-05-06";
const SERVER_SDK_VERSION = "0.1.42";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_NETWORK_RETRIES = 1;
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

const isBrowserRuntime = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined";

const throwServerSDKBrowserError = (): never => {
  throw new ArcPayError({
    type: "configuration_error",
    code: "server_sdk_browser_runtime",
    message:
      "@thavguard/arc-pay/server cannot be used in browser bundles. Keep sk_* secret keys on your backend.",
    retryable: false,
  });
};

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

const requireIdempotencyKey = (opts: RequestOptionsWithOptionalIdempotency): string => {
  if (!opts.idempotencyKey) {
    throw new ArcPayError({
      type: "validation_error",
      code: "missing_idempotency_key",
      message: "idempotencyKey is required for this operation",
      retryable: false,
    });
  }
  if (!isIdempotencyKey(opts.idempotencyKey)) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_idempotency_key",
      message: "idempotencyKey must be a valid UUIDv7",
      retryable: false,
    });
  }
  return opts.idempotencyKey;
};

const normalizeExecutePaymentRequest = (body: ExecutePaymentRequest): ExecutePaymentRequest => {
  if (!body || !body.payment_method) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_request",
      message: "payment_method is required",
      retryable: false,
    });
  }
  if (body.payment_method === "bank_card" && !body.card_token_id) {
    throw new ArcPayError({
      type: "validation_error",
      code: "missing_card_token_id",
      message: "card_token_id is required for bank_card executePayment",
      retryable: false,
    });
  }
  if (body.payment_mode !== "h2h") {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_payment_mode",
      message: "payment_mode must be h2h for executePayment",
      retryable: false,
    });
  }
  if (body.payment_method !== "bank_card") {
    if (!body.wallet_interaction) {
      throw new ArcPayError({
        type: "validation_error",
        code: "invalid_request",
        message: "wallet_interaction is required for wallet executePayment",
        retryable: false,
      });
    }
    if (body.wallet_interaction.provider !== body.payment_method) {
      throw new ArcPayError({
        type: "validation_error",
        code: "invalid_request",
        message: "wallet_interaction.provider must match payment_method",
        retryable: false,
      });
    }
  }
  return body;
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

const normalizePositiveMs = (
  value: number | undefined,
  fallback: number,
  code: string,
  message: string,
): number => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArcPayError({
      type: "validation_error",
      code,
      message,
      retryable: false,
    });
  }
  return value;
};

const normalizeMaxRetries = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_MAX_NETWORK_RETRIES;
  if (!Number.isInteger(value) || value < 0) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_retry_options",
      message: "maxNetworkRetries must be a non-negative integer",
      retryable: false,
    });
  }
  return value;
};

const defaultRetryDelayMs = (attempt: number): number => {
  const baseMs = Math.min(100 * 2 ** Math.max(0, attempt - 1), 1_000);
  return baseMs + Math.floor(Math.random() * baseMs);
};

const resolveRetryDelayMs = (
  retryDelayMs: ArcPayClientOptions["retryDelayMs"],
  attempt: number,
  error: ArcPayError,
): number => {
  const value = typeof retryDelayMs === "function" ? retryDelayMs(attempt, error) : retryDelayMs;
  if (value === undefined) return defaultRetryDelayMs(attempt);
  if (!Number.isFinite(value) || value < 0) {
    throw new ArcPayError({
      type: "validation_error",
      code: "invalid_retry_options",
      message: "retryDelayMs must be a non-negative finite number",
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

const parseRetryAfterSeconds = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
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
    requestId: detail.request_id ?? res.headers.get("x-request-id") ?? undefined,
    declineCode: detail.decline_code,
    retryable: isRetryableError(type, res.status, detail.code),
    retryAfterSeconds: parseRetryAfterSeconds(res.headers.get("retry-after")),
  });
};

const parseSuccessResponse = async <T>(res: Response): Promise<T> => {
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

export class ArcPayClient {
  private readonly secretKey: string;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxNetworkRetries: number;
  private readonly retryDelayMs: ArcPayClientOptions["retryDelayMs"];

  constructor(options: ArcPayClientOptions) {
    if (isBrowserRuntime()) throwServerSDKBrowserError();
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
    this.timeoutMs = normalizePositiveMs(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      "invalid_timeout_options",
      "timeoutMs must be a positive finite number",
    );
    this.maxNetworkRetries = normalizeMaxRetries(options.maxNetworkRetries);
    this.retryDelayMs = options.retryDelayMs;
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
    const result = await this.waitForPaymentTerminalResult(paymentId, opts);
    if (result.status === "terminal") return result.payment;
    throw new ArcPayError({
      type: "api_error",
      code: "payment_poll_timeout",
      message: `Payment ${paymentId} stayed ${result.payment_status} after ${result.elapsed_ms}ms and ${result.attempts} poll attempts`,
      retryable: true,
    });
  }

  async waitForPaymentTerminalResult(
    paymentId: string,
    opts: WaitForPaymentOptions = {},
  ): Promise<WaitForPaymentTerminalResult> {
    const intervalMs = normalizePollMs(opts.intervalMs, DEFAULT_POLL_INTERVAL_MS);
    const timeoutMs = normalizePollMs(opts.timeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    const terminalStatuses = new Set(opts.terminalStatuses ?? DEFAULT_TERMINAL_PAYMENT_STATUSES);
    const startedAt = Date.now();
    let attempts = 0;

    for (;;) {
      const payment = await this.getPayment(paymentId, { signal: opts.signal });
      attempts += 1;
      const elapsedMs = Date.now() - startedAt;
      if (terminalStatuses.has(payment.status as TerminalPaymentStatus)) {
        return {
          status: "terminal",
          payment,
          payment_status: payment.status as TerminalPaymentStatus,
          attempts,
          elapsed_ms: elapsedMs,
        };
      }
      if (elapsedMs >= timeoutMs) {
        return {
          status: "non_terminal",
          payment,
          payment_status: payment.status,
          attempts,
          elapsed_ms: elapsedMs,
          reason: "timeout",
        };
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
    opts: IdempotencyOptions,
  ): Promise<ExecutePaymentResponse> {
    return this.request<ExecutePaymentResponse>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/complete-3ds-method`,
      body,
      opts,
      true,
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

  async cancelLink(linkId: string, opts: IdempotencyOptions): Promise<Link>;
  async cancelLink(linkId: string, opts: RequestOptionsInput): Promise<Link> {
    return this.request<Link>(
      "DELETE",
      `/links/${encodeURIComponent(linkId)}`,
      undefined,
      opts,
      true,
    );
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
      "User-Agent": `ArcPay-JS/${SERVER_SDK_VERSION}`,
    };
    if (requireIdempotency) {
      headers["Idempotency-Key"] = requireIdempotencyKey(requestOpts);
    } else if (requestOpts.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = requireIdempotencyKey(requestOpts);
    }

    const url = `${this.apiBase}${path}`;
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    const safeToRetry = method === "GET" || headers["Idempotency-Key"] !== undefined;
    let attempt = 0;

    for (;;) {
      attempt += 1;
      const timeoutMs = normalizePositiveMs(
        requestOpts.timeoutMs,
        this.timeoutMs,
        "invalid_timeout_options",
        "timeoutMs must be a positive finite number",
      );
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
      const signal = requestOpts.signal
        ? AbortSignal.any([requestOpts.signal, timeoutController.signal])
        : timeoutController.signal;

      let error: ArcPayError | undefined;
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyText,
          signal,
        });
        clearTimeout(timeout);
        if (res.ok) return parseSuccessResponse<T>(res);
        error = await parseErrorResponse(res);
      } catch (err) {
        clearTimeout(timeout);
        const timedOut = timeoutController.signal.aborted && !requestOpts.signal?.aborted;
        error = new ArcPayError({
          type: timedOut ? "api_error" : "network_error",
          code: timedOut ? "request_timeout" : undefined,
          message: timedOut
            ? `Request timed out after ${timeoutMs}ms`
            : err instanceof Error
              ? err.message
              : "Network request failed",
          retryable: timedOut ? true : !requestOpts.signal?.aborted,
        });
      }

      if (!safeToRetry || !error.retryable || attempt > this.maxNetworkRetries) {
        throw error;
      }
      await sleep(resolveRetryDelayMs(this.retryDelayMs, attempt, error), requestOpts.signal);
    }
  }
}

export const createArcPayClient = (options: ArcPayClientOptions): ArcPayClient =>
  new ArcPayClient(options);
