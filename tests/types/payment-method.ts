import type {
  AvailablePaymentMethod,
  ExecutePaymentRequest,
  KnownPaymentMethod,
  PaymentMethod,
  WalletAction,
  WalletInteraction,
} from "../../src/server/browser";

// The built-in methods keep autocomplete; provider-catalog codes are accepted too.
const known: KnownPaymentMethod = "bank_card";
const fromKnown: PaymentMethod = known;
const pix: PaymentMethod = "pix";
const airtel: PaymentMethod = "airtel_gh";

const available: AvailablePaymentMethod["method"] = "airtel_gh";
const action: Pick<WalletAction, "provider"> = { provider: "pix" };
const interaction: WalletInteraction = {
  provider: "airtel_gh",
  surface: "merchant_web",
  action: "phone_push",
};
const wallet: ExecutePaymentRequest = {
  payment_method: "airtel_gh",
  payment_mode: "h2h",
  wallet_interaction: interaction,
};
const card: ExecutePaymentRequest = {
  payment_method: "bank_card",
  payment_mode: "h2h",
  card_token_id: "tok_1",
};

// @ts-expect-error A payment method code is a string, never a number.
const numeric: PaymentMethod = 7;

// @ts-expect-error KnownPaymentMethod stays closed to the built-in methods.
const notKnown: KnownPaymentMethod = "pix";

void [fromKnown, pix, airtel, available, action, wallet, card, numeric, notKnown];
