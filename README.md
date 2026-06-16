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
  timeoutMs: 30_000,
  maxNetworkRetries: 1,
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

The server client sends `User-Agent: ArcPay-JS/<version>` and retries transient
network/API failures only when the request is safe to retry: `GET` requests or
mutating requests with an explicit idempotency key. Arc Pay `timeout` responses
are not retried automatically because they mean the payment is pending
confirmation; keep the same order waiting, poll `GET /payments/{id}`, and rely
on webhooks or reconciliation. Configure `timeoutMs`, `maxNetworkRetries`, and
`retryDelayMs` on the client when your backend needs stricter operational
limits.

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
import { confirmPayment, newIdempotencyKey } from "@thavguard/arc-pay/js";

const result = await confirmPayment({
  paymentId,
  cardTokenId,
  // Optional but recommended: set this from the Accept header your backend saw
  // when it rendered the checkout page. Browser JS cannot read that header.
  browserAcceptHeader: initialBrowserAcceptHeader,
  async executePayment(request) {
    const response = await fetch(`/api/payments/${paymentId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": newIdempotencyKey(),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Payment execution failed");
    return response.json();
  },
  async completeThreeDSMethod(completion) {
    // Forward completion unchanged. It includes browser_info for banks that
    // require browser data during 3DS Method finalization.
    const response = await fetch(`/api/payments/${paymentId}/complete-3ds-method`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": newIdempotencyKey(),
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

## SBP QR with the server SDK

SBP is a wallet/APM H2H flow. Keep the secret key on your backend, create the
payment, then execute it with `wallet_interaction`. Render the returned
`wallet_action` exactly as provided by Arc Pay.

```ts
import { createArcPayClient, newIdempotencyKey } from "@thavguard/arc-pay/server";

const client = createArcPayClient({ secretKey: process.env.ARCPAY_SECRET_KEY! });

const payment = await client.createPayment(
  {
    amount: 10000,
    currency: "RUB",
    payment_method: "sbp",
    external_id: "order-123",
    capture_mode: "one_stage",
    success_url: "https://merchant.example/success",
    fail_url: "https://merchant.example/fail",
    callback_url: "https://merchant.example/webhooks/arc-pay",
  },
  { idempotencyKey: newIdempotencyKey() },
);

const execution = await client.executePayment(
  payment.id,
  {
    payment_method: "sbp",
    payment_mode: "h2h",
    wallet_interaction: {
      provider: "sbp",
      surface: "merchant_web",
      action: "qr",
      back_url: "https://merchant.example/return",
    },
  },
  { idempotencyKey: newIdempotencyKey() },
);

if (execution.wallet_action?.action === "qr") {
  // Show execution.wallet_action.qr_url or qr_image_base64 in your checkout UI.
}
```

For browser checkouts, use `confirmWalletPayment()` to call your backend execute
proxy and receive a browser-friendly `walletAction` object. The helper keeps
the public API request in snake_case and normalizes the returned action to
camelCase for UI code.

```ts
import { confirmWalletPayment, newIdempotencyKey } from "@thavguard/arc-pay/js";

const result = await confirmWalletPayment({
  paymentId,
  paymentMethod: "sbp",
  walletInteraction: {
    provider: "sbp",
    surface: "merchant_web",
    action: "qr",
    back_url: "https://merchant.example/return",
  },
  async executePayment(request) {
    const response = await fetch(`/api/payments/${paymentId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": newIdempotencyKey(),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("SBP execution failed");
    return response.json();
  },
});

if (result.status === "wallet_action" && result.walletAction.action === "qr") {
  // Render result.walletAction.qrUrl or result.walletAction.qrImageBase64.
}
```

Do not construct NSPK payloads or bank-specific merchant identifiers yourself.
If `status` is `failed`, use `decline_code` and `decline_message` for the buyer
or support flow; for example `sbp_merchant_not_found` means the terminal is not
configured for SBP at the acquiring bank.

The server client accepts an optional `apiBase` only for local or isolated test
environments. Production integrations should use the default
`https://api.arcpay.space/v1`; sandbox/live is selected by the key prefix.

## Go Server SDK

The Go server SDK lives in `go/` and exposes the same server-side REST contract:
secret-key authentication, required idempotency for mutating calls, typed
errors, request timeouts, transient retries, and payment polling helpers.

```sh
go get github.com/Arc-pay/js-sdk/go
```

```go
package checkout

import (
  "context"
  "time"

  arcpay "github.com/Arc-pay/js-sdk/go"
)

func createPayment(ctx context.Context) (*arcpay.Payment, error) {
  client, err := arcpay.NewClient(arcpay.ClientOptions{
    SecretKey:         "sk_test_...",
    Timeout:           30 * time.Second,
    MaxNetworkRetries: arcpay.RetryCount(1),
  })
  if err != nil {
    return nil, err
  }

  payment, err := client.CreatePayment(ctx, arcpay.CreatePaymentRequest{
    Amount:        10000,
    Currency:      arcpay.RUB,
    PaymentMethod: arcpay.BankCard,
    ExternalID:    "order-1",
    CaptureMode:   arcpay.OneStage,
    SuccessURL:    "https://merchant.example/success",
    FailURL:       "https://merchant.example/fail",
  }, arcpay.IdempotencyOptions{
    IdempotencyKey: "018f2f6a-4f53-7b9b-8f7b-2f0d9f6f2a31",
  })
  if err != nil {
    return nil, err
  }
  return &payment, nil
}
```

All Go SDK methods accept `context.Context` as the first argument. Use request
contexts from your HTTP handlers so cancellations and deadlines propagate
through outbound Arc Pay calls. `WaitForPaymentTerminalResult` returns
diagnostics (`Attempts`, `Elapsed`, and last `PaymentStatus`) instead of hiding
non-terminal states behind an opaque timeout.
Leave `MaxNetworkRetries` unset to use the SDK default, or pass
`arcpay.RetryCount(0)` to disable transient network retries explicitly.

## License

MIT.
