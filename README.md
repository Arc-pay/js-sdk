# Arc Pay JavaScript SDK

Browser and server SDK for Arc Pay integrations.

## Install

```sh
npm install @arcpay/sdk
```

## Browser SDK

```ts
import { ArcPay } from "@arcpay/sdk";

const arcpay = await ArcPay.load({
  publishableKey: "pk_test_...",
  environment: "sandbox",
});
```

## React Bindings

```ts
import { ArcPayProvider, useArcPay } from "@arcpay/sdk/react";
```

## Server SDK

```ts
import { createArcPayClient } from "@arcpay/sdk/server";

const client = createArcPayClient({
  secretKey: "sk_test_...",
});
```

Amounts are integer minor units. Never pass card PAN or CVV to server APIs; use Hosted Fields for browser card entry.
