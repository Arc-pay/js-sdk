export type ArcPayErrorType =
  | "validation_error"
  | "configuration_error"
  | "authentication_error"
  | "authorization_error"
  | "state_error"
  | "rate_limit_error"
  | "api_error"
  | "network_error"
  | "challenge_aborted";

interface ArcPayErrorInit {
  type: ArcPayErrorType;
  message: string;
  code?: string;
  param?: string;
  paymentId?: string;
  declineCode?: string;
  retryable: boolean;
  requestId?: string;
  retryAfterSeconds?: number;
}

export class ArcPayError extends Error {
  readonly type: ArcPayErrorType;
  readonly code?: string;
  readonly param?: string;
  readonly paymentId?: string;
  readonly declineCode?: string;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(init: ArcPayErrorInit) {
    super(init.message);
    this.name = "ArcPayError";
    this.type = init.type;
    this.code = init.code;
    this.param = init.param;
    this.paymentId = init.paymentId;
    this.declineCode = init.declineCode;
    this.retryable = init.retryable;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export const isValidationError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "validation_error";
const isConfigurationError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "configuration_error";
export const isAuthenticationError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "authentication_error";
export const isAuthorizationError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "authorization_error";
export const isStateError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "state_error";
export const isRateLimitError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "rate_limit_error";
export const isApiError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "api_error";
export const isNetworkError = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "network_error";
export const isChallengeAborted = (e: unknown): e is ArcPayError =>
  e instanceof ArcPayError && e.type === "challenge_aborted";
