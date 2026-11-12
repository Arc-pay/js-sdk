import { ArcPayError } from "../core/errors";
import type { ArcPayClientOptions } from "./client";

const browserServerSDKError = (): ArcPayError =>
  new ArcPayError({
    type: "configuration_error",
    code: "server_sdk_browser_runtime",
    message:
      "@thavguard/arc-pay/server cannot be used in browser bundles. Keep sk_* secret keys on your backend.",
    retryable: false,
  });

export class ArcPayClient {
  constructor(options: ArcPayClientOptions) {
    void options;
    throw browserServerSDKError();
  }
}

export const createArcPayClient = (options: ArcPayClientOptions): ArcPayClient =>
  new ArcPayClient(options);

export type {
  Currency,
  PaymentMethod,
  CaptureMode,
  PaymentFlowMode,
  Locale,
  PaymentStatus,
  PaymentOperationType,
  PaymentOperationStatus,
  PaymentOperationSummary,
  TerminalPaymentStatus,
  Payment,
  PaymentList,
  FiscalVatRate,
  FiscalItem,
  CreatePaymentRequest,
  CreateCardSetupRequest,
  CaptureRequest,
  VoidRequest,
  CreateRefundRequest,
  Refund,
  WalletInteractionAction,
  WalletInteractionSurface,
  WalletInteraction,
  WalletAction,
  CardBrowserInfo,
  CardExecutePaymentRequest,
  WalletExecutePaymentRequest,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  PaymentNextAction,
  ChargeSavedCardRequest,
  CompleteThreeDSMethodRequest,
  WaitForPaymentOptions,
  WaitForPaymentTerminalResult,
  AvailablePaymentMethod,
  CreateLinkRequest,
  Link,
  CreateCheckoutSessionRequest,
  CheckoutSession,
  ListPaymentsQuery,
  ListAvailablePaymentMethodsQuery,
} from "./types";
export type { ArcPayClientOptions, IdempotencyOptions, RequestOptions } from "./client";
