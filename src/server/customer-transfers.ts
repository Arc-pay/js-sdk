/** Generic customer transfers. Bank capabilities determine which rails are available. */
export type CustomerTransferRail = "card_oct" | "card_aft" | "sbp_b2c" | "bank_account";
export type CustomerTransferStatus =
  | "created"
  | "reserved"
  | "bank_checked"
  | "bank_processing"
  | "completed"
  | "failed"
  | "canceled"
  | "outcome_unknown"
  | "returned";
/** Hosted session lifecycle state. Unknown future values remain assignable. */
export type CustomerTransferSessionStatus =
  | "created"
  | "destination_attached"
  | "submitted"
  | "expired"
  | "creating"
  | "active"
  | "otp_pending"
  | "otp_verified"
  | "submitting"
  | "canceled"
  | "failed"
  | (string & {});
export type CustomerTransferSessionOtpStatus =
  | "not_required"
  | "pending"
  | "verified"
  | "locked"
  | (string & {});
export type CustomerTransferSessionReservationStatus =
  | "pending"
  | "reserved"
  | "consumed"
  | "released"
  | "failed"
  | (string & {});
export type CustomerTransferEnvironment = "sandbox" | "live";
export interface CreateCustomerTransferSessionRequest {
  amount: number;
  currency: string;
  external_reference: string;
  /** Optional; not used by pricing, routing or banks. */
  purpose_code?: string;
  customer_reference?: string;
  description?: string;
  success_url?: string;
  fail_url?: string;
  callback_url?: string;
  allowed_rails?: CustomerTransferRail[];
  expires_in_hours?: number;
  recipient_phone?: string;
  /** Optional merchant-bound metadata; values are kept private by the hosted session. */
  recipient_email?: string;
  recipient_profile?: PayoutPartyProfile;
  sender_profile?: PayoutPartyProfile;
  payer?: { payer_account?: string; payer_inn?: string; income_type_code?: string };
}
export interface CustomerTransferSession {
  session_id: string;
  amount: number;
  source_debit: number;
  fee: number;
  currency: string;
  purpose_code: string;
  status: CustomerTransferSessionStatus;
  environment: CustomerTransferEnvironment;
  expires_at: string;
  hosted_url?: string;
  external_reference?: string;
  customer_reference?: string;
  disbursement_id?: string;
  allowed_rails?: CustomerTransferRail[];
  resolved_rails?: CustomerTransferRail[];
  rail?: CustomerTransferRail;
  description?: string;
  otp_required?: boolean;
  otp_status?: CustomerTransferSessionOtpStatus;
  disbursement_status?: CustomerTransferStatus;
  reservation_status?: CustomerTransferSessionReservationStatus;
  manual_reconciliation_required?: boolean;
  retry_policy?: string;
  failure_reason?: "issuer_amount_limit" | "issuer_count_limit";
  next_check_at?: string;
  merchant_name?: string;
  recipient_phone_mask?: string;
  success_url?: string;
  fail_url?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  /** Safe indicators only; merchant-bound values are never returned. */
  bound_recipient_fields?: Array<"first_name" | "last_name" | "middle_name" | "email">;
  card?: {
    card_mask?: string;
    card_scheme?: string;
  };
}

export interface PayoutPartyProfile {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  street?: string;
  city?: string;
  state_code?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  date_of_birth?: string;
  identity_type?: string;
  identity_id?: string;
  identity_country?: string;
  identity_expiry_date?: string;
  nationality?: string;
  country_of_birth?: string;
}

/** Direct API B2C intent. Route, source, payer authority and bank credentials are server-owned. */
export interface CreateCustomerDisbursementRequest {
  amount: number;
  currency: string;
  /** Optional; not used by pricing, routing or banks. */
  purpose_code?: string;
  card_token_id: string;
  external_reference?: string;
  customer_reference?: string;
  description?: string;
  bank_backref?: string;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_profile?: PayoutPartyProfile;
  sender_profile?: PayoutPartyProfile;
}

export interface TokenizeCustomerDisbursementCardRequest {
  pan: string;
  customer_reference?: string;
}

export interface TokenizeCustomerDisbursementCardResponse {
  /** Confirmed token owner for customer-scoped deletion; older deployments may omit it. */
  customer_reference?: string;
  card_token_id: string;
  card_mask: string;
  card_scheme: string;
  card_bin: string;
}

export interface CancelCustomerDisbursementRequest {
  expected_version: number;
  reason?: string;
}
export interface CustomerDisbursement {
  disbursement_id: string;
  /** Current version to supply as expected_version when canceling. */
  version?: number;
  /** Merchant-owned order or transfer reference. */
  external_reference?: string;
  customer_reference?: string;
  /** Merchant or provider reference for the selected recipient destination. */
  recipient_reference?: string;
  amount: number;
  source_debit: number;
  fee: number;
  currency: string;
  /** Omitted when none was supplied. */
  purpose_code?: string;
  description?: string;
  status: CustomerTransferStatus;
  rail: CustomerTransferRail;
  provider_operation_id?: string;
  failed_reason?: string;
  retry_policy?:
    "do_not_retry" | "retry_later" | "change_details" | "contact_support" | "reconcile_first";
  manual_reconciliation_required?: boolean;
  next_check_at?: string;
  bank_rrn?: string;
  bank_internal_ref?: string;
  bank_auth_code?: string;
  /** Masked recipient card (first six and last four digits) for card rails. */
  card_mask?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
export interface CustomerDisbursementList {
  disbursements: CustomerDisbursement[];
  next_cursor?: string;
}
