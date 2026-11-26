import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Full bundle (payments + Hosted Fields). 12 KB until 0.1.57; raised by 0.5 KB for listener isolation,
// atomic update() and debounced autoAdvance. Hosted Fields only pages use the 9 KB fields bundle.
const LIMIT_GZIP_BYTES = 12.5 * 1024;
const FIELDS_LIMIT_GZIP_BYTES = 9 * 1024; // Hosted Fields only bundle, currently about 7.7 KB
const dist = resolve(process.cwd(), "dist");

const candidates = [
  { path: `${dist}/index.mjs`, label: "ESM core (uncompressed pre-minify)" },
  { path: `${dist}/react/index.mjs`, label: "ESM React (uncompressed pre-minify)" },
  { path: `${dist}/cdn/arcpay.global.js`, label: "CDN IIFE (minified)" },
  {
    path: `${dist}/cdn/arcpay.fields.global.js`,
    label: "CDN IIFE Hosted Fields only (minified)",
    limit: FIELDS_LIMIT_GZIP_BYTES,
  },
];

let failed = false;
let any = false;
for (const t of candidates) {
  if (!existsSync(t.path)) continue;
  any = true;
  const raw = readFileSync(t.path);
  const gz = gzipSync(raw).length;
  const limit = t.limit ?? LIMIT_GZIP_BYTES;
  const ok = gz <= limit;
  console.log(
    `${ok ? "OK" : "FAIL"} ${t.label}: ${(gz / 1024).toFixed(2)} KB gzipped (limit ${limit / 1024} KB)`,
  );
  if (!ok) failed = true;
}
if (!any) {
  console.error("No build artifacts found. Run `pnpm build` first.");
  process.exit(1);
}
if (failed) process.exit(1);
