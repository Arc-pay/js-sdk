/**
 * Entry of the Hosted Fields only CDN bundle (dist/cdn/arcpay.fields.global.js).
 *
 * Same global shape as the full bundle for what it contains: `ArcPay.ArcPay.load(pk)` and
 * `ArcPay.ArcPayError`. It leaves out the 3DS actions, confirmPayment and the customer-transfer
 * helpers, which a card form that only mounts Hosted Fields does not use (about 37% smaller
 * gzipped). Bundler users do not need it: the package is side-effect free and tree-shakes.
 */
export { ArcPay } from "./core/arcpay";
export { ArcPayError } from "./core/errors";
