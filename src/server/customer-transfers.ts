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
export type CustomerTransferEnvironment = "sandbox" | "live";
export interface CreateCustomerTransferSessionRequest {
  amount: number;
  currency: string;
  external_reference: string;
  purpose_code: string;
  customer_reference?: string;
  description?: string;
  success_url?: string;
  fail_url?: string;
  callback_url?: string;
  allowed_rails?: CustomerTransferRail[];
  expires_in_hours?: number;
  recipient_phone?: string;
  payer?: { payer_account?: string; payer_inn?: string; income_type_code?: string };
}
export interface CustomerTransferSession {
  session_id: string;
  amount: number;
  source_debit: number;
  fee: number;
  currency: string;
  purpose_code: string;
  status: string;
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
  otp_status?: string;
  disbursement_status?: CustomerTransferStatus;
  reservation_status?: string;
  manual_reconciliation_required?: boolean;
  retry_policy?: string;
  next_check_at?: string;
  merchant_name?: string;
  recipient_phone_mask?: string;
  success_url?: string;
  fail_url?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  card?: {
    card_mask?: string;
    card_scheme?: string;
    recipient_first_name?: string;
    recipient_middle_name?: string;
    recipient_last_name?: string;
    recipient_email?: string;
    recipient_phone?: string;
    sender_name?: string;
    sender_address?: string;
    sender_country?: string;
    sender_city?: string;
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
  purpose_code: string;
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
  amount: number;
  source_debit?: number;
  fee?: number;
  currency: string;
  status: CustomerTransferStatus;
  rail?: CustomerTransferRail;
  provider_operation_id?: string;
  failed_reason?: string;
  retry_policy?:
    "do_not_retry" | "retry_later" | "change_details" | "contact_support" | "reconcile_first";
  manual_reconciliation_required?: boolean;
  next_check_at?: string;
  bank_rrn?: string;
  bank_internal_ref?: string;
  bank_auth_code?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
export interface CustomerDisbursementList {
  disbursements: CustomerDisbursement[];
  next_cursor?: string;
}
