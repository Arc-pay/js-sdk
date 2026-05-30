export type Currency = "RUB" | "KZT" | "UZS";

export type PaymentMethod =
  | "bank_card"
  | "sbp"
  | "sberpay"
  | "tpay"
  | "alfapay"
  | "dolyami"
  | "mirpay"
  | "applepay"
  | "googlepay"
  | "bnpl";

export type CaptureMode = "one_stage" | "two_stage";
export type PaymentFlowMode = "h2h" | "redirect";
export type Locale = "ru" | "en";

export type PaymentStatus =
  | "created"
  | "pending"
  | "pending_3ds"
  | "authorized"
  | "captured"
  | "settled"
  | "voided"
  | "expired"
  | "refunded"
  | "chargeback"
  | "declined"
  | "failed"
  | "timeout";

type PaymentOperation = "create" | "capture" | "refund" | "void" | "execute";
export type TerminalPaymentStatus =
  | "authorized"
  | "captured"
  | "settled"
  | "voided"
  | "expired"
  | "refunded"
  | "chargeback"
  | "declined"
  | "failed";

export interface Payment {
  id: string;
  amount: number;
  authorized_amount?: number;
  captured_amount?: number;
  refunded_amount?: number;
  currency: Currency;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  external_id?: string;
  description?: string;
  bank_payment_id?: string;
  bank_code?: string;
  bank_order_id?: string;
  bank_terminal_id?: string;
  bank_rrn?: string;
  bank_internal_ref?: string;
  bank_auth_code?: string;
  card_token_id?: string;
  decline_code?: string;
  card_mask?: string;
  card_scheme?: string;
  redirect_url?: string;
  payment_mode?: PaymentFlowMode;
  capture_mode?: CaptureMode;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, string>;
}

export interface PaymentList {
  payments: Payment[];
  total: number;
  next_cursor: string;
  page_size: number;
}

export type FiscalVatRate = "no_vat" | "vat0" | "vat10" | "vat110" | "vat120" | "vat20";

export interface FiscalItem {
  name: string;
  quantity: string;
  unit_price: number;
  vat_rate: FiscalVatRate;
  payment_object: string;
  payment_method: string;
  measure: string;
}

export interface CreatePaymentRequest {
  amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  external_id: string;
  capture_mode: CaptureMode;
  customer_id?: string;
  description?: string;
  success_url: string;
  fail_url: string;
  callback_url?: string;
  customer_email?: string;
  customer_phone?: string;
  merchant_inn?: string;
  metadata?: Record<string, string>;
  fiscal_items?: FiscalItem[];
}

export interface CreateCardSetupRequest {
  currency: Currency;
  customer_id: string;
  external_id?: string;
  success_url: string;
  fail_url: string;
  callback_url?: string;
  metadata?: Record<string, string>;
}

export interface CaptureRequest {
  amount?: number;
}

export interface VoidRequest {
  reason?: string;
}

export interface CreateRefundRequest {
  amount: number;
  reason?: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  amount: number;
  currency: Currency;
  status: "pending" | "completed" | "failed";
  reason?: string;
  created_at: string;
}

export type WalletInteractionAction = "redirect" | "deeplink" | "qr" | "sdk" | "phone_push";
export type WalletInteractionSurface = "merchant_web" | "merchant_app" | "native_app";

export interface WalletInteraction {
  provider: PaymentMethod;
  surface: WalletInteractionSurface;
  action: WalletInteractionAction;
  back_url?: string;
  app_deep_link?: string;
  phone?: string;
}

export interface WalletAction {
  provider: PaymentMethod;
  action: WalletInteractionAction;
  sdk?: string;
  url?: string;
  qr_url?: string;
  qr_image_base64?: string;
  qr_content_type?: "image/png" | "image/svg+xml";
  bank_invoice_id?: string;
  back_url?: string;
}

export interface CardBrowserInfo {
  accept_header: string;
  language: string;
  screen_width: number;
  screen_height: number;
  color_depth: 1 | 4 | 8 | 15 | 16 | 24 | 32 | 48;
  timezone_offset_minutes: number;
  java_enabled?: boolean;
  user_agent: string;
  window_size?: "01" | "02" | "03" | "04" | "05";
}

export interface CardExecutePaymentRequest {
  payment_method: "bank_card";
  card_token_id: string;
  payment_mode: "h2h";
  browser_info: CardBrowserInfo;
}

export interface WalletExecutePaymentRequest {
  payment_method: Exclude<PaymentMethod, "bank_card">;
  payment_mode: "h2h";
  wallet_interaction: WalletInteraction;
}

export type ExecutePaymentRequest = CardExecutePaymentRequest | WalletExecutePaymentRequest;

export interface ExecutePaymentResponse {
  payment_id: string;
  status: "authorized" | "captured" | "pending" | "pending_3ds" | "failed" | "declined";
  authorized_amount?: number;
  payment_mode?: PaymentFlowMode;
  liability_shifted?: boolean;
  card_token_id?: string;
  wallet_action?: WalletAction;
  next_action?: PaymentNextAction;
  decline_code?: string;
  decline_message?: string;
}

export interface PaymentNextAction {
  type: "three_ds_method" | "three_ds_challenge";
  three_ds: {
    version: "1" | "2";
    phase: "method" | "challenge";
    three_ds_server_trans_id?: string;
    completion_endpoint?: string;
    submit: {
      method: "POST";
      url: string;
      target: "hidden_iframe" | "browser";
      fields: { name: string; value: string }[];
    };
  };
}

export interface ChargeSavedCardRequest {
  amount: number;
  currency: Currency;
  card_token_id: string;
  customer_id: string;
  external_id?: string;
  description?: string;
  metadata?: Record<string, string>;
  merchant_inn?: string;
  fiscal_items?: FiscalItem[];
}

export interface CompleteThreeDSMethodRequest {
  completion_indicator: "Y" | "N" | "U";
  three_ds_server_trans_id: string;
}

export interface WaitForPaymentOptions {
  intervalMs?: number;
  timeoutMs?: number;
  terminalStatuses?: readonly TerminalPaymentStatus[];
  signal?: AbortSignal;
}

export interface AvailablePaymentMethod {
  method: PaymentMethod;
  payment_mode: PaymentFlowMode;
  display_name: string;
  is_active: boolean;
  unavailable_reason?: string;
  icon_url?: string;
  supported_currencies?: Currency[];
  supported_countries?: string[];
  min_amount?: number;
  max_amount?: number;
  sandbox_requirements?: string;
}

export interface CreateLinkRequest {
  link_type: "one_time" | "reusable" | "invoice" | "recurring";
  amount: number;
  currency: Currency;
  description?: string;
  environment?: "live" | "sandbox";
  max_uses?: number;
  expires_at?: string;
  customer_name?: string;
  customer_id?: string;
  customer_email?: string;
  due_date?: string;
  redirect_url?: string;
  webhook_url?: string;
  external_order_id?: string;
  metadata?: Record<string, string>;
  capture_mode: CaptureMode;
  autocompletion_date?: string;
  locale?: Locale;
  payment_methods: {
    method: PaymentMethod;
    payment_mode: PaymentFlowMode;
  }[];
  items?: {
    name: string;
    quantity: string;
    unit_price: number;
    vat_rate: 0 | 10 | 20;
    payment_object: string;
    payment_method: string;
    measure: string;
  }[];
  billing_config?: {
    interval_type?: "day" | "week" | "month" | "year";
    interval_count?: number;
    trial_days?: number;
    trial_price?: number;
  };
}

export interface Link {
  id: string;
  tenant_id?: string;
  organization_id?: string;
  short_code: string;
  link_type: "one_time" | "reusable" | "invoice" | "recurring";
  status: "active" | "paid" | "expired" | "canceled";
  environment: "live" | "sandbox";
  amount: number;
  currency: Currency;
  created_at?: string;
  updated_at?: string;
  description?: string;
  url: string;
  max_uses?: number;
  uses_count?: number;
  expires_at?: string;
  customer_name?: string;
  customer_id?: string;
  customer_email?: string;
  due_date?: string;
  external_order_id?: string;
  payment_methods: {
    method: PaymentMethod;
    payment_mode: PaymentFlowMode;
    display_name?: string;
  }[];
  redirect_url?: string;
  webhook_url?: string;
  items?: {
    name?: string;
    quantity?: string;
    unit_price?: number;
    vat_rate?: number;
  }[];
  billing_config?: {
    interval_type?: string;
    interval_count?: number;
    trial_days?: number;
    trial_price?: number;
  };
  metadata?: Record<string, string>;
  capture_mode: CaptureMode;
  autocompletion_date?: string;
  locale?: Locale;
}

export interface CreateCheckoutSessionRequest {
  amount: number;
  currency: Currency;
  description?: string;
  payment_methods: {
    method: PaymentMethod;
    payment_mode: PaymentFlowMode;
  }[];
  capture_mode: CaptureMode;
  success_url?: string;
  fail_url?: string;
  cancel_url?: string;
  customer_email?: string;
  customer_id?: string;
  external_id?: string;
  metadata?: Record<string, string>;
  fiscal_items?: FiscalItem[];
  autocompletion_date?: string;
  locale?: Locale;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface ListPaymentsQuery {
  cursor?: string;
  page_size?: number;
  status?: PaymentStatus;
  payment_method?: PaymentMethod;
  bank_code?: string;
  decline_code?: string;
  payment_flow_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface ListAvailablePaymentMethodsQuery {
  environment: "live" | "sandbox";
}
