import { ArcPayError } from "./errors";

const API_VERSION = "2026-05-06";

interface ClientConfig {
  apiBase: string;
  publishableKey: string;
}

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface Client {
  post<T = unknown>(path: string, body: unknown, opts?: RequestOptions): Promise<T>;
  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
}

interface ApiErrorBody {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
    request_id?: string;
    decline_code?: string;
  };
}

const isApiErrorTypeString = (t: unknown): t is ArcPayError["type"] =>
  t === "validation_error" ||
  t === "authentication_error" ||
  t === "authorization_error" ||
  t === "state_error" ||
  t === "rate_limit_error" ||
  t === "api_error";

const buildHeaders = (
  publishableKey: string,
  idempotencyKey: string | undefined,
): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${publishableKey}`,
    "X-Arc-Pay-API-Version": API_VERSION,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      )
    ) {
      throw new ArcPayError({
        type: "validation_error",
        code: "invalid_idempotency_key",
        message: "idempotencyKey must be a valid UUID",
        retryable: false,
      });
    }
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return headers;
};

const isRetryableError = (type: ArcPayError["type"], status: number, code?: string): boolean => {
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
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* fall through with empty body */
  }
  const errBody = body.error ?? {};
  const type = isApiErrorTypeString(errBody.type)
    ? errBody.type
    : res.status >= 500
      ? "api_error"
      : "validation_error";
  return new ArcPayError({
    type,
    code: errBody.code,
    message: errBody.message ?? `Request failed with status ${res.status}`,
    param: errBody.param,
    requestId: errBody.request_id,
    declineCode: errBody.decline_code,
    retryable: isRetryableError(type, res.status, errBody.code),
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

export const createClient = (config: ClientConfig): Client => {
  const send = async <T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<T> => {
    const url = `${config.apiBase}${path}`;
    const init: RequestInit & { headers: Record<string, string> } = {
      method,
      headers: buildHeaders(config.publishableKey, opts?.idempotencyKey),
      signal: opts?.signal,
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new ArcPayError({
        type: "network_error",
        message: e instanceof Error ? e.message : "Network request failed",
        retryable: true,
      });
    }
    if (!res.ok) throw await parseErrorResponse(res);
    return parseSuccessResponse<T>(res);
  };

  return {
    post: <T>(path: string, body: unknown, opts?: RequestOptions) =>
      send<T>("POST", path, body, opts),
    get: <T>(path: string, opts?: RequestOptions) => send<T>("GET", path, undefined, opts),
  };
};
