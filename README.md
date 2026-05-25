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

`@thavguard/arc-pay/server` intentionally does not expose `tokenizeCard()`.
Tokenization belongs to Hosted Fields. Direct browser calls with a publishable
key are only for explicitly approved raw-card forms; those forms handle
cardholder data in the merchant environment and require the applicable PCI DSS
controls before live traffic. Keep `sk_*` keys on your backend for payment
creation, execution, capture, void, refund, saved-card charges, payment links,
and checkout sessions.

Mutating server-client methods require an explicit `{ idempotencyKey }`:
`createPayment`, `executePayment`, `capturePayment`, `voidPayment`,
`createRefund`, `chargeSavedCard`, `createLink`, and
`createCheckoutSession`. Missing idempotency raises `ArcPayError` with
`code="missing_idempotency_key"` before any HTTP request is sent.

H2H card execution returns a standardized `next_action` when the buyer must do
something in the browser. The SDK helper turns that action into the POST form
descriptor you render in a hidden iframe or visible browser page:

```ts
import { buildThreeDSBrowserForm, getThreeDSAction } from "@thavguard/arc-pay/server";

const result = await client.executePayment(paymentId, body, { idempotencyKey });
const action = getThreeDSAction(result.next_action);

if (action) {
  const form = buildThreeDSBrowserForm(action);
  // Render POST form using form.action, form.method, form.target, form.fields.
  // For action.type === "three_ds_method", call completeThreeDSMethod from your
  // backend after the hidden iframe finishes or times out.
}
```

Do not branch on bank-specific 3DS fields. Arc Pay normalizes 3DS 1.x and 2.x
into `next_action.three_ds.submit`.

The server client accepts an optional `apiBase` only for local or isolated test
environments. Production integrations should use the default
`https://api.arcpay.space/v1`; sandbox/live is selected by the key prefix.

## License

MIT.
