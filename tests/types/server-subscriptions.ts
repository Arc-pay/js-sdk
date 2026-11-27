import type {
  BillingCycle,
  CreateSubscriptionRequest,
  CustomerTransferCard,
  SavedCard,
  Subscription,
} from "../../src/server";

// Spec-required fields are required; spec-optional ones may be absent.
const subscription: Subscription = {
  id: "s",
  tenant_id: "t",
  organization_id: "o",
  status: "active",
  environment: "sandbox",
  customer_id: "c",
  customer_email: "",
  amount: 100,
  currency: "RUB",
  interval_type: "month",
  interval_count: 1,
  billing_day: 1,
  created_at: "2026-11-27T00:00:00Z",
  payment_method: "bank_card",
};
const additive: Pick<
  Subscription,
  "version" | "retry_schedule" | "cancel_at_period_end" | "next_billing_date"
> = { version: 2, retry_schedule: [2, 3], cancel_at_period_end: true };

const cycle: BillingCycle = {
  id: "b",
  subscription_id: "s",
  status: "waived",
  amount: 100,
  currency: "RUB",
  period_start: "2026-11-27T00:00:00Z",
  period_end: "2026-12-27T00:00:00Z",
  created_at: "2026-11-27T00:00:00Z",
  attempts: 0,
};

const savedCard: SavedCard = {
  card_token_id: "t",
  card_mask: "411111******1111",
  card_scheme: "visa",
  bank_code: "bank",
  is_active: true,
  created_at: "2026-11-27T00:00:00Z",
};

const payoutCard: CustomerTransferCard = {
  card_token_id: "t",
  card_mask: "411111******1111",
  card_scheme: "",
  customer_reference: "r",
  created_at: "2026-11-27T00:00:00Z",
};

const badMethod: CreateSubscriptionRequest = {
  customer_id: "c",
  // @ts-expect-error only bank_card and sbp can be charged on a schedule.
  payment_method: "tpay",
};

void [subscription, additive, cycle, savedCard, payoutCard, badMethod];
