import { ArcPayError, type ArcPayErrorType } from "../core/errors";
import type {
  AvailablePaymentMethod,
  CaptureRequest,
  CheckoutSession,
  CompleteThreeDSMethodRequest,
  CreateCheckoutSessionRequest,
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
  Refund,
  VoidRequest,
} from "./types";

export type {
  AvailablePaymentMethod,
  CaptureMode,
  CaptureRequest,
  CheckoutSession,
  CompleteThreeDSMethodRequest,
  CreateCheckoutSessionRequest,
  CreateLinkRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  Currency,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  Link,
  ListAvailablePaymentMethodsQuery,
  ListPaymentsQuery,
  Payment,
  PaymentFlowMode,
  PaymentList,
  PaymentMethod,
  PaymentStatus,
  Refund,
  VoidRequest,
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

export interface RequestOptions {
  signal?: AbortSignal;
}

const DEFAULT_API_BASE = "https://api.arcpay.space/v1";
const API_VERSION = "2026-05-06";

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

const normalizeBase = (base: string): string => base.replace(/\/+$/, "");

const requireIdempotencyKey = (opts: IdempotencyOptions): string => {
  if (!opts.idempotencyKey) {
    throw new ArcPayError({
      type: "validation_error",
      code: "missing_idempotency_key",
      message: "idempotencyKey is required for this operation",
      retryable: false,
    });
  }
  return opts.idempotencyKey;
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
    retryable: type === "api_error" || type === "rate_limit_error",
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

  async createPayment(body: CreatePaymentRequest, opts: IdempotencyOptions): Promise<Payment> {
    return this.request<Payment>("POST", "/payments", body, opts);
  }

  async getPayment(paymentId: string, opts: RequestOptions = {}): Promise<Payment> {
    return this.request<Payment>(
      "GET",
      `/payments/${encodeURIComponent(paymentId)}`,
      undefined,
      opts,
    );
  }

  async capturePayment(
    paymentId: string,
    body: CaptureRequest,
    opts: IdempotencyOptions,
  ): Promise<Payment> {
    return this.request<Payment>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      body,
      opts,
    );
  }

  async voidPayment(
    paymentId: string,
    body: VoidRequest,
    opts: IdempotencyOptions,
  ): Promise<Payment> {
    return this.request<Payment>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/void`,
      body,
      opts,
    );
  }

  async createRefund(
    paymentId: string,
    body: CreateRefundRequest,
    opts: IdempotencyOptions,
  ): Promise<Refund> {
    return this.request<Refund>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      body,
      opts,
    );
  }

  async executePayment(
    paymentId: string,
    body: ExecutePaymentRequest,
    opts: IdempotencyOptions,
  ): Promise<ExecutePaymentResponse> {
    return this.request<ExecutePaymentResponse>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/execute`,
      body,
      opts,
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

  async createLink(body: CreateLinkRequest, opts: IdempotencyOptions): Promise<Link> {
    return this.request<Link>("POST", "/links", body, opts);
  }

  async createCheckoutSession(
    body: CreateCheckoutSessionRequest,
    opts: IdempotencyOptions,
  ): Promise<CheckoutSession> {
    return this.request<CheckoutSession>("POST", "/checkout/sessions", body, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    opts: RequestOptions | IdempotencyOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "X-Arc-Pay-API-Version": API_VERSION,
      "Content-Type": "application/json",
    };
    if ("idempotencyKey" in opts) {
      headers["Idempotency-Key"] = requireIdempotencyKey(opts);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: opts.signal,
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
