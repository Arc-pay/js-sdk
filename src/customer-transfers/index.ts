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

function compactPayoutPartyProfile(
  profile: PayoutPartyProfile | undefined,
): PayoutPartyProfile | undefined {
  if (!profile) return undefined;
  const compact: PayoutPartyProfile = {};
  for (const [key, value] of Object.entries(profile)) {
    const trimmed = value?.trim();
    if (trimmed) compact[key as keyof PayoutPartyProfile] = trimmed;
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
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
      // Optional party metadata is omitted when blank so the API and selected
      // adapter can distinguish absent fields from explicitly supplied data.
      const payload: Record<string, unknown> = { pan: input.pan };
      const optionalStrings: Record<string, string | undefined> = {
        recipient_first_name: input.recipient_first_name,
        recipient_last_name: input.recipient_last_name,
        recipient_middle_name: input.recipient_middle_name,
        recipient_email: input.recipient_email,
        recipient_phone: input.recipient_phone,
        sender_name: input.sender_name,
        sender_address: input.sender_address,
        sender_country: input.sender_country,
        sender_city: input.sender_city,
      };
      for (const [key, value] of Object.entries(optionalStrings)) {
        const trimmed = value?.trim();
        if (trimmed) payload[key] = trimmed;
      }
      const recipientProfile = compactPayoutPartyProfile(input.recipient_profile);
      const senderProfile = compactPayoutPartyProfile(input.sender_profile);
      if (recipientProfile) payload.recipient_profile = recipientProfile;
      if (senderProfile) payload.sender_profile = senderProfile;
      return client.post<CustomerTransferCardToken>(`${path}/tokenize`, payload);
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
