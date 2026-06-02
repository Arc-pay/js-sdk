import { defineConfig } from "tsup";

const cdn = process.env.BUILD === "cdn";

export default defineConfig(
  cdn
    ? {
        entry: { arcpay: "src/index.ts" },
        format: ["iife"],
        globalName: "ArcPay",
        outDir: "dist/cdn",
        clean: true,
        minify: true,
        sourcemap: true,
        treeshake: true,
        target: "es2018",
      }
    : {
        entry: [
          "src/index.ts",
          "src/react/index.ts",
          "src/server/index.ts",
          "src/server/browser.ts",
        ],
        format: ["esm", "cjs"],
        dts: true,
        clean: true,
        sourcemap: true,
        treeshake: true,
        splitting: false,
        target: "es2018",
        minify: false,
        external: ["react"],
        outExtension({ format }) {
          return { js: format === "esm" ? ".mjs" : ".cjs" };
        },
      },
);
