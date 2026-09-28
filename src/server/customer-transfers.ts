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
