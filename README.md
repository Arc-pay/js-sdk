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

### Script tag builds

`dist/cdn/arcpay.global.js` is the full browser bundle (`window.ArcPay.ArcPay`, `confirmPayment`,
3DS actions, customer transfers). If a page only mounts Hosted Fields, load
`dist/cdn/arcpay.fields.global.js` instead: the same `ArcPay.ArcPay.load(...)` and
`ArcPay.ArcPayError`, about 38% smaller gzipped (7.5 KB instead of 12.1 KB). Bundler users
need neither: the package is side-effect free and tree-shakes.

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

Card data never goes to the API host. When card data is posted straight from the
page (for example the customer-transfer session client), the page must also
allow the card-entry origin in `connect-src`. The host comes from the
`card_entry_url` in the ticket response: `https://cards.arcpay.space` in
production, `https://dev-cards.arcpay.space:30444` on dev and
`https://debug-cards.arcpay.space:30444` on debug. Hosted Fields keep card data
inside the `https://sdk.arcpay.space` iframe, so the merchant page needs only
the `frame-src` and API `connect-src` entries above.

Hosted Fields performs a browser settings check against Arc Pay API before
mounting fields. That check is internal to the SDK; merchants should configure
CSP for the public origins above, not call the settings endpoint directly.
Client-side validation can reject a card before any request with the local
codes `invalid_card_number`, `invalid_cvv`, `invalid_expiry` and `card_expired`
(expiry month already past); these are raised by the SDK, not returned by the API.
Tokenization is two requests from `https://sdk.arcpay.space`: a ticket request to the
public API (`POST /payments/{id}/card-entry-ticket`, no card data, authenticated
with the publishable key), then the card itself straight to the card-entry
endpoint named in the ticket response (`X-Card-Entry-Ticket` and `Content-Type`
headers only). Card data never reaches the public API host or the merchant page.

Hosted Fields formats buyer input inside the secure iframe: card numbers are
grouped with spaces and expiry dates are displayed as `MM/YY`. The tokenization
request strips those separators before sending PAN and expiry to Arc Pay, so
merchant code should not read, mirror, or reformat card details outside the
iframe.

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
      border: "0",
      borderRadius: "6px",
      boxShadow: "none",
      height: "44px",
      padding: "10px 12px",
      outline: "none",
    },
    rules: {
      focus: { "font-weight": "600" },
      invalid: { color: "#dc2626" },
      complete: { color: "#047857" },
    },
  },
});

const card = elements.create("card", {
  placeholder: "1234 1234 1234 1234",
  appearance: {
    rules: {
      base: { "font-weight": "500" },
    },
  },
});

card.mount("#card");
```

For full merchant-owned layout control, use split Hosted Fields. Each field is a
separate secure iframe, so merchant CSS controls the outer grid, spacing,
labels, and wrappers independently:

```ts
const elements = arcpay.elements({ appearance });
const cardNumber = elements.create("cardNumber", {
  placeholder: "1234 1234 1234 1234",
});
const cardExpiry = elements.create("cardExpiry", { placeholder: "MM/YY" });
const cardCvv = elements.create("cardCvv", { placeholder: "CVV" });

cardNumber.mount("#card-number");
cardExpiry.mount("#card-expiry");
cardCvv.mount("#card-cvv");

const token = await elements.tokenize(paymentId, idempotencyKey);
```

The caller owns `idempotencyKey`: generate one key for each payment and
tokenization attempt, then pass that same key when replaying an unresolved
request. If the outcome is unknown (for example, a timeout), reconcile the
payment before deciding what to do next; a retryable error must replay with the
same key and must not silently start a fresh authorization. Generate a new key
only for an explicitly new payment attempt or a different `paymentId`.

Do not mix `card` with split fields in one `Elements` instance. In split mode,
PAN, expiry, and CVV are still kept inside Arc Pay iframes and synchronized only
over the Arc Pay same-origin channel for tokenization; merchant JavaScript
receives readiness, focus, validation, brand, and tokenization result events,
not raw card data. Split fields require browser `BroadcastChannel` support.
The channel is restricted to the Arc Pay iframe origin and the current top-level
site partition; merchant-provided MessagePorts are never used for field values.

#### Fonts and numerals

Hosted Fields run in their own origin with `font-src 'self'`, so `@font-face`
rules and font URLs from the merchant page cannot reach them. Fonts are
therefore served by Arc Pay: reference a bundled family by name in
`fontFamily` / `font-family` and add a fallback stack.

Bundled families: **Geologica** and **Inter** (Latin, Latin Extended, Cyrillic,
Cyrillic Extended; variable weight 100-900). Both have tabular numerals. Only
the subsets a field actually needs are downloaded, and the digit subset is
fetched before `ready` so numbers are not first painted in a fallback font.

```ts
const elements = arcpay.elements({
  appearance: {
    variables: {
      fontFamily: "Geologica, system-ui, sans-serif",
      fontWeight: "400",
      fontVariantNumeric: "tabular-nums", // fixed-width digits while typing
    },
    rules: {
      // any allowlisted property is also available per state
      focus: { "font-feature-settings": '"tnum" 1' },
    },
  },
});
```

`font-variant-numeric`, `font-feature-settings` and `color-scheme` are part of the allowlist
(`HostedFieldsStyleProperty`). The `arcpay` theme enables `tabular-nums` by
default; the default theme `"none"` leaves numerals untouched. Style values
that load resources (`url(...)`, `image-set(...)`, `@import`) or exceed 512
characters are dropped.

### Hosted Fields options

Every option below is optional, can be set for all fields in
`arcpay.elements({...})` and overridden per field in `elements.create(field, {...})`,
and can be changed later with `element.update({...})`. Invalid values throw an
`ArcPayError` (`invalid_hosted_fields_option`) before anything is mounted.

| Option | Default | Effect |
| --- | --- | --- |
| `locale` | `"auto"` | `"ru"`, `"en"` (region tags such as `ru-RU` are accepted) or the browser language for default texts, errors and help. |
| `texts.placeholders` / `texts.labels` | localized | Per input: `cardNumber`, `cardExpiry`, `cardCvv`. |
| `texts.errors` | localized | `issue.message` and the screen-reader error by issue code (`HOSTED_FIELD_ISSUE_CODES`). |
| `layout` | `10px / 74px / 64px` | Composite `card` only: `gap`, `expiryWidth`, `cvvWidth` (`0` or px, rem, em, %). |
| `minHeight` | `"44px"` | Minimum iframe height. |
| `mountTimeoutMs` | `10000` | Wait for the iframe handshake before `loaderror` (`iframe_ready_timeout`); 3000-120000. Raise it for slow networks. |
| `disabled`, `readOnly` | `false` | Standard input states; style them with `rules.disabled`. |
| `autofocus` | `false` | Focus the field once it is ready. |
| `autoAdvance` | `false` | Move to the next field once one is complete and valid (composite and split). |
| `showBrandIcon` | `false` | Neutral brand badge inside the number input (Visa, Mastercard, Mir, Amex, Maestro, UnionPay, JCB, Discover, Diners). |
| `maskCvv` | `true` | `false` shows the security code as digits. |
| `expiryYearFormat` | `"YY"` | `"YYYY"` displays and accepts `MM/YYYY`. |

```ts
const elements = arcpay.elements({
  locale: "ru",
  showBrandIcon: true,
  autoAdvance: true,
  texts: { errors: { card_number_invalid: "Проверьте номер карты" } },
});
const card = elements.create("card", { layout: { gap: "8px", cvvWidth: "5rem" } });
card.on("submit", () => pay()); // Enter pressed inside a field; no card data
card.update({ disabled: true });
```

Appearance gains `rules.disabled`, `rules.hover` and `rules.autofill` (browser
autofill no longer paints its own background over your style) and
`theme: "arcpay-dark"`. `issue.message` and `help.message` follow `locale`; use
`issue.code` for logic.

New element events: `loading` (mounted, waiting for the handshake), `submit` and
`escape` (Enter/Escape inside a field). The factory emits `tokenizing`,
`tokenized` and `tokenizeerror` through `elements.on(...)`, and
`elements.tokenize(paymentId, idempotencyKey, { timeoutMs })` accepts
1000-120000 ms (default 30000).

Behaviour that now applies to everyone: a lone month digit 2-9 becomes `0X/`,
Backspace can delete past the `/` and spaces, the security code length follows
the brand (Amex 4, other known brands 3; split mode checks it at `tokenize()`),
Amex numbers must be 15 digits, expiry years more than 20 years ahead are
rejected (`card_expiry_too_far`), and a `placeholder` given to a split
`cardExpiry` / `cardCvv` element is now honored.

#### Dark and tinted checkouts

The secure iframe never paints a background of its own: `html` and `body` inside it
are transparent, and only the input takes colors from `appearance`. For a dark
checkout use `theme: "arcpay-dark"` (or set `colorText`, `colorPlaceholder` and
`colorBackground` yourself) and declare the same scheme on your page
(`html { color-scheme: dark }`) or pass `"color-scheme": "dark"` in `rules.base`:
when the embedding page and the iframe disagree about the color scheme, browsers
paint an opaque backdrop behind the iframe.

#### Narrow containers and local development

The composite `card` element shrinks its expiry and code columns below 340px so a
16-digit number stays readable; explicit `layout` values are never overridden. For
very small widths the split fields (separate iframes) give you full control.

Hosted Fields are served with a strict `frame-ancestors` policy per merchant
origin, and the edge refuses `http://localhost` and `http://127.0.0.1` as parent
origins in every environment. Develop against an `https://` origin (for example a
local TLS proxy or a staging host) and add it to the allowed origins of the test
merchant.

`appearance.theme` defaults to `"none"` so Arc Pay branding is not imposed on
merchant checkout pages. `theme: "arcpay"` is available for demos and quick
starts. Supported iframe properties are limited to input-level text, color,
caret, placeholder, opacity, background, border, outline, shadow, padding,
height, and box sizing. This supports flat, bordered, and underline-only fields
without cropping the iframe or breaking text centering. Container CSS such as
margin, position, transform, z-index, and background images is intentionally
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
`cancelLink`, `createCheckoutSession`, `createSubscription`, and
`retrySubscriptionBilling`. Missing idempotency raises
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

`browser_info` is optional on the wire: every field may be omitted and Arc Pay
fills defaults and normalizes the values server-side (see the H2H guide).
`collectBrowserInfo()` still gathers the real browser values, which gives the
issuer the best frictionless decision.

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

## Subscriptions and stored cards

```ts
const subscription = await client.createSubscription(
  {
    customer_id: "customer-1",
    amount: 100000,
    currency: "RUB",
    billing_interval_type: "month",
    billing_interval_count: 1,
    payment_method: "bank_card",
    card_token_id: savedCardTokenId,
    external_id: "plan-42",
    retry_schedule: [2, 3],
  },
  { idempotencyKey },
);

// Find it again by your own reference. The reference is not unique.
const { subscriptions } = await client.listSubscriptions({ external_id: "plan-42" });

// Cancel at the end of the paid period, or change your mind before it ends.
await client.cancelSubscription(subscription.id, { cancel_at_period_end: true });
await client.uncancelSubscription(subscription.id);
```

Persist the create key with your order: it never creates a second subscription,
and reusing it with other parameters answers `409`. A direct subscription without
a trial is not charged for its first period. `items` and `trial_items` carry
receipt data only when `link_id` is omitted.

Also available: `getSubscription`, `pauseSubscription`, `resumeSubscription`,
`retrySubscriptionBilling` and `listSubscriptionBillingCycles`. A manual retry
charges the customer, so reuse its key after a network failure or an unknown
outcome. `cancelSubscription`, `uncancelSubscription`, `pauseSubscription` and
`resumeSubscription` take no idempotency key and are not retried automatically;
after a failure, read the subscription before calling again. Webhook delivery
order is not guaranteed: apply a webhook or a read only when its `version` is
greater than the one you stored.

`listSavedCards({ customer_id })` and
`deleteSavedCard(cardTokenId, { customer_id })` manage cards saved for payments.
Deletion also revokes a payout token; pass the `customer_reference` it was
tokenized with as `customer_id`.

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
    return_url: "https://merchant.example/return",
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

`currency` is any ISO 4217 alphabetic code, and `amount` is an integer in that
currency's minor unit: `1234` is 12.34 RUB, 1234 JPY (no minor unit) or 1.234
KWD. Which currencies a payment method processes is merchant configuration.

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
  // For SBP, result.walletAction.hostedUrl (when present) is our payment page
  // with a bank list: offer it as a link or as a second QR for a phone camera.
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

## Customer transfers

On the merchant backend, call `createCustomerTransferSession` with a secret key
and a UUID idempotency key (versions 1–8 accepted; UUIDv7 recommended). Supply only bank-required payer fields in `payer`;
PSB uses `payer_account`. The recipient never receives the merchant payer profile.
Recipient contact and identity data can be bound at session creation when the
selected bank requires it; these fields are optional and are never returned to
the hosted recipient page as raw values:

```ts
await client.createCustomerTransferSession(
  {
    amount: 1000,
    currency: "RUB",
    external_reference: "order-123",
    description: "Payout for order 123",
    recipient_email: "recipient@example.test",
    recipient_profile: { first_name: "Ada", last_name: "Lovelace" },
    sender_profile: { first_name: "Merchant" },
  },
  { idempotencyKey },
);
```

Omit fields that are not available; the hosted form asks only for recipient
fields not already bound by the merchant.

`purpose_code` is optional for sessions and direct transfers; it is not used by
pricing, routing or banks, and the session response may return it as an empty
string. `description` is the bank payment purpose text (PSB B2C: 1-150
characters).
The server SDK also exposes `listCustomerDisbursements`, `getCustomerDisbursement`
and `refreshCustomerDisbursement`, including reconciliation and retry diagnostics.

Stored payout recipient cards are read with
`listCustomerTransferCards({ customer_reference })` and
`getCustomerTransferCard(cardTokenId, { customer_reference })`. Always pass
`customer_reference` when tokenizing a recipient card: cards without it are never
listed. `expires_at` is the end of the token storage period, not the card expiry.
The error code `card_token_unavailable` means the token was revoked or erased:
tokenize the card again.

### Payout recipient card from a merchant page

To save a recipient card in your own UI without the PAN touching your servers or
page script, create a card setup on the backend and finish it with Hosted
Fields. The card number is entered inside the Elements iframe and sent only to
the Arc Pay card-entry host; your page receives the token id and the mask.

```ts
// Backend (secret key). allowed_origin must be registered for your account.
const setup = await client.createCustomerTransferCardSetup(
  { customer_reference: "expert-42", allowed_origin: "https://app.example.com" },
  { idempotencyKey },
);
// Give setup.card_setup_id only to the authenticated recipient's page.
```

```ts
// Merchant page (publishable key), served from allowed_origin.
const elements = arcpay.elements();
const cardNumber = elements.create("cardNumber");
cardNumber.mount("#recipient-card");
cardNumber.on("ready", () => (button.disabled = false));

const result = await elements.tokenizeRecipientCard(cardSetupId);
// { setupId, cardTokenId, cardMask, cardScheme, expiresAt? }
```

- Only the `cardNumber` Element is used: no expiry or CVC. Creating `card`,
  `cardExpiry` or `cardCvv` on the same `Elements` instance fails with
  `mixed_hosted_fields_mode`.
- A setup lives 30 minutes and completes once. Calling the method again after a
  network break is safe: the same card yields the same token, and attaching the
  same token again returns the same result.
- Do not pay out to `cardTokenId` from the browser alone. Confirm it on the
  backend with the `customer_transfer_card_setup.completed` webhook or
  `getCustomerTransferCardSetup(card_setup_id)` (status `completed`, `card`).
- Errors arrive as `ArcPayError` with the API code, for example
  `card_setup_expired`, `card_setup_completed`, `origin_not_allowed`,
  `card_token_unavailable` or `rate_limited`; `tokenize_timeout` when the iframe
  does not answer.
- Your CSP needs only `frame-src` for the Elements origin.

For the server PAN path, `createCustomerDisbursementCardEntryTicket({
customer_reference })` returns `{ticket, card_entry_url, expires_at,
customer_reference}`: POST `{pan}` to `card_entry_url` from your backend with the
`X-Card-Entry-Ticket` header.

Use the returned hosted URL, or import `createCustomerTransferSessionClient`
from the browser SDK for the recipient journey. `tokenizeCard` accepts PAN plus
optional recipient/sender metadata; payout tokenization does not accept expiry
or CVV. The PAN is sent only to the card-entry endpoint returned with a ticket
(pages using it must allow that host in `connect-src`, see the CSP notes
above); the API receives just the token id and the metadata. The card-entry host
only accepts platform origins: the Arc Pay hosted page, the SDK iframe or
Elements, and White Label hosts attested by the HPP ticket. Hosted Fields work
from a merchant page because the card is entered inside the SDK iframe. The
session client's `tokenizeCard` posts from the page itself, so it works only on
a platform-origin page (the hosted session URL) and not from a merchant-owned
origin; from a merchant origin, redirect the recipient to the hosted URL for
card entry. The other session client calls go to the API host only. The session client supports retrieval, optional OTP, card or SBP
attachment and submission. Bank capabilities determine available rails. The
provided PSB B2C document supports CARD_OCT; other PSB rails require their bank
contracts. Choose the deployment API URL separately from the key's sandbox/live
business mode. An unknown outcome must be reconciled before a new attempt.
