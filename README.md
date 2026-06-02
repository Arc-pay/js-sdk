# Arc Pay JavaScript SDK

Browser and server SDK for Arc Pay integrations.

## Install

```sh
npm install @thavguard/arc-pay
```

## Browser SDK

```ts
import { ArcPay } from "@thavguard/arc-pay/js";

const arcpay = await ArcPay.load("pk_test_...");
const elements = arcpay.elements();
```

`ArcPay.load()` takes the publishable key as the first argument. Sandbox/live is
inferred from the key prefix (`pk_test_` or `pk_live_`). Hosted Fields are served
from `https://sdk.arcpay.space` and tokenize against the Arc Pay public API
configured for that iframe app.

## React Bindings

```ts
import { ArcPayProvider, useArcPay } from "@thavguard/arc-pay/react";
```

## Server SDK

```ts
import { createArcPayClient } from "@thavguard/arc-pay/server";

const client = createArcPayClient({
  secretKey: "sk_test_...",
});
```

Amounts are integer minor units. Never pass card PAN or CVV to server APIs; use Hosted Fields for browser card entry.

Browser pages using Hosted Fields must allow frames from `https://sdk.arcpay.space`
and API connections to `https://api.arcpay.space`. If your Content Security
Policy also governs telemetry, allow connections to your configured Sentry ingest
host or disable browser telemetry at your application layer.

Hosted Fields performs a browser settings check against Arc Pay API before
mounting fields. That check is internal to the SDK; merchants should configure
CSP for the public origins above, not call the settings endpoint directly.
Tokenization requests are sent from `https://sdk.arcpay.space` to the public API
with `Authorization: Bearer <pk_...>`, `Content-Type`, optional
`Idempotency-Key`, `sentry-trace`, and `baggage` headers. Direct REST callers
may use either `Authorization: Bearer <pk_...>` or `X-Api-Key: pk_...` for
`/payments/{id}/tokenize`.

### Hosted Fields appearance

Hosted Fields are secure iframe inputs. The merchant page owns layout and
container styling: labels, wrappers, spacing, borders, shadows, error text, and
the submit button should be regular merchant CSS. Arc Pay only styles the input
text inside each iframe through a typed, allowlisted `appearance` contract.

```ts
const elements = arcpay.elements({
  appearance: {
    variables: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "16px",
      lineHeight: "24px",
      colorText: "#111827",
      colorPlaceholder: "#9ca3af",
      colorDanger: "#dc2626",
      caretColor: "#111827",
    },
    rules: {
      focus: { "font-weight": "600" },
      invalid: { color: "#dc2626" },
      complete: { color: "#047857" },
    },
  },
});

const number = elements.create("cardNumber", {
  placeholder: "1234 1234 1234 1234",
});
const expiry = elements.create("cardExpiry");
const cvc = elements.create("cardCvv", {
  appearance: {
    rules: {
      base: { "text-align": "center" },
    },
  },
});

number.mount("#card-number");
expiry.mount("#card-expiry");
cvc.mount("#card-cvv");
```

`appearance.theme` defaults to `"none"` so Arc Pay branding is not imposed on
merchant checkout pages. `theme: "arcpay"` is available for demos and quick
starts. Supported iframe properties are limited to text, color, caret,
placeholder, opacity, and `background-color`; container CSS such as border,
padding, margin, shadow, position, transform, and z-index is intentionally
dropped. The exported `HostedFieldsStyleProperty` and `HostedFieldsStyleBlock`
types expose the same allowlist to TypeScript integrations. Use element `change`
events (`isEmpty`, `isComplete`, `isValid`, `brand`, `lastFour`) to style your
own wrappers.

`@thavguard/arc-pay/server` intentionally does not expose `tokenizeCard()`.
Tokenization belongs to Hosted Fields. Direct browser calls with a publishable
key are only for explicitly approved raw-card forms; those forms handle
cardholder data in the merchant environment and require the applicable PCI DSS
controls before live traffic. Keep `sk_*` keys on your backend for payment
creation, execution, capture, void, refund, saved-card charges, payment links,
and checkout sessions.

Mutating server-client methods require an explicit `{ idempotencyKey }`:
`createPayment`, `createCardSetup`, `executePayment`, `capturePayment`, `voidPayment`,
`createRefund`, `chargeSavedCard`, `completeThreeDSMethod`, `createLink`,
`cancelLink`, and `createCheckoutSession`. Missing idempotency raises
`ArcPayError` with `code="missing_idempotency_key"` before any HTTP request is
sent.

H2H card payments require HTTPS `success_url` and `fail_url` on
`createPayment`. Arc Pay stores those URLs on the payment and redirects the
buyer back to the stored merchant URL after ACS authentication. Treat the browser
return as navigation only; confirm the final status through webhooks or
`GET /payments/{id}`.

H2H card execution returns a standardized `next_action` when the buyer must do
something in the browser. The shape is bank-agnostic: integrations branch only
on `next_action.type`, `next_action.three_ds.phase`, and Arc Pay payment
statuses. Do not branch on Sber, PSB, Alfa, Tinkoff, or any other adapter field.

Run `executePayment` only on your backend with a secret key. For the browser
handoff, prefer `confirmPayment()`: it collects `browser_info`, calls your
backend execute proxy, runs 3DS Method/challenge actions, optionally waits for a
terminal payment, and returns a clear result union:

- `terminal` — Arc Pay reached `authorized`, `captured`, `declined`, `failed`,
  or another terminal status.
- `requires_action` — the buyer is on the issuer ACS page and the result will
  arrive through webhook/status polling.
- `non_terminal` — no more browser action is available, but the payment is still
  pending or polling timed out.

```ts
import { confirmPayment } from "@thavguard/arc-pay/js";

const result = await confirmPayment({
  paymentId,
  cardTokenId,
  async executePayment(request) {
    const response = await fetch(`/api/payments/${paymentId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Payment execution failed");
    return response.json();
  },
  async completeThreeDSMethod(completion) {
    const response = await fetch(`/api/payments/${paymentId}/complete-3ds-method`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(completion),
    });
    if (!response.ok) throw new Error("3DS Method completion failed");
    return response.json();
  },
  waitForPaymentTerminal: ({ paymentId, signal }) =>
    fetch(`/api/payments/${paymentId}/wait-terminal`, { signal }).then((response) => {
      if (!response.ok) throw new Error("Payment status wait failed");
      return response.json().then((result) => result.payment);
    }),
});

if (result.status === "terminal") {
  // Show success/failure from result.paymentStatus.
}
```

Do not branch on bank-specific 3DS fields. Arc Pay normalizes 3DS 1.x and 2.x
into `next_action.three_ds.submit`.

Your backend can implement `/api/payments/:id/wait-terminal` with
`client.waitForPaymentTerminalResult(paymentId)`. The result includes the last
payment status, poll attempts, and elapsed time, so test harnesses can report
`pending_3ds` or `pending` as a clear non-terminal result instead of hiding it as
an opaque timeout. The older `waitForPaymentTerminal(paymentId)` convenience
method still returns only the terminal payment and throws on timeout.

The browser helper automates the merchant-owned handoff, but the issuer ACS page
still belongs to the bank after the challenge form is submitted. Webhooks remain
the authoritative production signal for order fulfillment.

For saved cards and subscriptions, create a setup intent with
`createCardSetup()`, tokenize through Hosted Fields, execute the setup payment,
complete any returned 3DS browser step, and wait for a terminal payment that
contains `card_token_id`. Later merchant-initiated charges use
`chargeSavedCard()`.

The server client accepts an optional `apiBase` only for local or isolated test
environments. Production integrations should use the default
`https://api.arcpay.space/v1`; sandbox/live is selected by the key prefix.

## License

MIT.
