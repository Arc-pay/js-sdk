# arcpay Playwright e2e

Real-browser tests for the SDK. Complement vitest unit tests (see `../tests/`) by validating real DOM/iframe behavior, hosted card fields, and CSP interactions across Chromium/Firefox/WebKit.

## Run

```bash
# install browsers once
pnpm --filter arcpay e2e:install

# build CDN bundle (tests load it via fixtures/merchant.html)
pnpm --filter arcpay build:all

# run all tests headless
pnpm --filter arcpay e2e

# run with visible browser
pnpm --filter arcpay e2e:headed
```

## How it works

Most tests intercept `fetch` via `page.route("**/v1/**", ...)` returning canned responses. The merchant page (`fixtures/merchant.html`) loads the CDN IIFE bundle copied from `../dist/cdn/arcpay.global.js` by the Playwright web server, so it must be built before tests run.
