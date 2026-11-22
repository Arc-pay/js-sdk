import type {
  CustomerDisbursement,
  CustomerTransferSession,
} from "../../src/server/customer-transfers";
import type { ChargeSavedCardRequest } from "../../src/server/types";

// Spec-required fields are required; spec-optional ones are accepted.
const disbursement: CustomerDisbursement = {
  disbursement_id: "d1",
  amount: 100,
  source_debit: 100,
  fee: 0,
  currency: "RUB",
  rail: "card_oct",
  status: "completed",
  external_reference: "order-1",
  customer_reference: "cust-1",
  recipient_reference: "rcp-1",
  purpose_code: "refund",
  description: "Refund",
  card_mask: "447817****1066",
  created_at: "2026-11-22T00:00:00Z",
  updated_at: "2026-11-22T00:00:00Z",
};

// @ts-expect-error source_debit, fee and rail are required by the spec.
const incomplete: CustomerDisbursement = {
  disbursement_id: "d1",
  amount: 100,
  currency: "RUB",
  status: "completed",
  created_at: "2026-11-22T00:00:00Z",
  updated_at: "2026-11-22T00:00:00Z",
};

// Known session states autocomplete, an unknown future value still type-checks.
const session: Pick<
  CustomerTransferSession,
  "status" | "otp_status" | "reservation_status"
> = { status: "otp_pending", otp_status: "locked", reservation_status: "some_future_state" };
const futureStatus: CustomerTransferSession["status"] = "some_future_state";

const recurring: ChargeSavedCardRequest = {
  amount: 100,
  currency: "RUB",
  card_token_id: "t",
  customer_id: "c",
  stored_credential_reason: "recurring",
  recurring_frequency_days: 30,
  recurring_expiry: "20271231",
};
const badReason: ChargeSavedCardRequest = {
  amount: 100,
  currency: "RUB",
  card_token_id: "t",
  customer_id: "c",
  // @ts-expect-error only unscheduled_cof and recurring are accepted.
  stored_credential_reason: "scheduled",
};

void [disbursement, incomplete, session, futureStatus, recurring, badReason];
