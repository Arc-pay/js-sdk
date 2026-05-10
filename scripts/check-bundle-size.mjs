import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const LIMIT_GZIP_BYTES = 12 * 1024; // 12 KB
const dist = resolve(process.cwd(), "dist");

const candidates = [
  { path: `${dist}/index.mjs`, label: "ESM core (uncompressed pre-minify)" },
  { path: `${dist}/react/index.mjs`, label: "ESM React (uncompressed pre-minify)" },
  { path: `${dist}/cdn/arcpay.global.js`, label: "CDN IIFE (minified)" },
];

let failed = false;
let any = false;
for (const t of candidates) {
  if (!existsSync(t.path)) continue;
  any = true;
  const raw = readFileSync(t.path);
  const gz = gzipSync(raw).length;
  const ok = gz <= LIMIT_GZIP_BYTES;
  console.log(
    `${ok ? "OK" : "FAIL"} ${t.label}: ${(gz / 1024).toFixed(2)} KB gzipped (limit ${LIMIT_GZIP_BYTES / 1024} KB)`,
  );
  if (!ok) failed = true;
}
if (!any) {
  console.error("No build artifacts found. Run `pnpm build` first.");
  process.exit(1);
}
if (failed) process.exit(1);
