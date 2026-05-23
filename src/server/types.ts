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

export type PaymentOperation = "create" | "capture" | "refund" | "void" | "execute";

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
  page: number;
  page_size: number;
}

export interface CreatePaymentRequest {
  amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  external_id: string;
  capture_mode: CaptureMode;
  description?: string;
  success_url?: string;
  fail_url?: string;
  callback_url?: string;
  customer_email?: string;
  customer_phone?: string;
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

export interface ExecutePaymentRequest {
  card_token_id: string;
  payment_mode: "h2h";
  browser_info: {
    accept_header: string;
    language: string;
    screen_width: number;
    screen_height: number;
    color_depth: 1 | 4 | 8 | 15 | 16 | 24 | 32 | 48;
    timezone_offset_minutes: number;
    java_enabled?: boolean;
    user_agent: string;
    window_size?: "01" | "02" | "03" | "04" | "05";
  };
}

export interface ExecutePaymentResponse {
  payment_id: string;
  status: "authorized" | "captured" | "pending" | "pending_3ds" | "failed" | "declined";
  authorized_amount?: number;
  payment_mode?: PaymentFlowMode;
  redirect_url?: string;
  qr_url?: string;
  qr_image_base64?: string;
  qr_content_type?: "image/png" | "image/svg+xml" | string;
  qr_expires_at?: string;
  liability_shifted?: boolean;
  requires_3ds?: boolean;
  acs_url?: string;
  c_req?: string;
  pa_req?: string;
  md?: string;
  term_url?: string;
  three_ds_method_url?: string;
  three_ds_method_data?: string;
  three_ds_server_trans_id?: string;
  decline_code?: string;
  decline_message?: string;
}

export interface CompleteThreeDSMethodRequest {
  completion_indicator: "Y" | "N" | "U";
  three_ds_server_trans_id: string;
}

export interface AvailablePaymentMethod {
  method: PaymentMethod;
  payment_mode: PaymentFlowMode;
  display_name: string;
  is_active: boolean;
  icon_url?: string;
  supported_operations?: PaymentOperation[];
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
    vat_rate?: number;
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
  external_id?: string;
  metadata?: Record<string, string>;
  autocompletion_date?: string;
  locale?: Locale;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface ListPaymentsQuery {
  page?: number;
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
