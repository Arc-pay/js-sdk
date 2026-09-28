import { createClient } from "../core/client";
import { ArcPayError } from "../core/errors";
import { luhnCheck } from "../tokenize/luhn";
import type { CustomerTransferSession, CustomerDisbursement } from "../server/customer-transfers";

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
export interface CustomerTransferCardInput {
  pan: string;
  recipient_first_name?: string;
  recipient_last_name?: string;
  recipient_middle_name?: string;
  recipient_email?: string;
  recipient_phone?: string;
  sender_name?: string;
  sender_address?: string;
  sender_country?: string;
  sender_city?: string;
  recipient_profile?: PayoutPartyProfile;
  sender_profile?: PayoutPartyProfile;
}
export interface CustomerTransferCardToken {
  card_token_id: string;
  card_mask: string;
  card_scheme: string;
  card_bin: string;
  expires_in: number;
  expires_at: string;
}

/** Recipient-side session capability; requires no merchant secret or card expiry/CVV. */
export function createCustomerTransferSessionClient(
  sessionId: string,
  apiBase = "https://api.arcpay.space",
) {
  const client = createClient({ apiBase });
  const path = `/v1/customer-transfer-sessions/${encodeURIComponent(sessionId)}`;
  return {
    get: () => client.get<CustomerTransferSession>(path),
    tokenizeCard: (input: CustomerTransferCardInput) => {
      if (!/^\d{13,19}$/.test(input.pan) || !luhnCheck(input.pan)) {
        throw new ArcPayError({
          type: "validation_error",
          code: "invalid_card_number",
          message: "Invalid recipient PAN",
          retryable: false,
        });
      }
      return client.post<CustomerTransferCardToken>(`${path}/tokenize`, input);
    },
    sendOTP: () =>
      client.post<{ session: CustomerTransferSession; retry_after: string }>(
        `${path}/otp/send`,
        {},
      ),
    verifyOTP: (otpCode: string) =>
      client.post<CustomerTransferSession>(`${path}/otp/verify`, { otp_code: otpCode }),
    attachSBP: (input: {
      recipient_bank_member_id: string;
      recipient_phone: string;
      recipient_pam?: string;
      recipient_reference?: string;
    }) => client.post<CustomerTransferSession>(`${path}/sbp`, input),
    submit: (input: { description?: string } = {}) =>
      client.post<CustomerDisbursement>(`${path}/submit`, input),
  };
}
