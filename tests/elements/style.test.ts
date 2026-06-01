import { describe, it, expect } from "vitest";
import { buildStyleFromAppearance, sanitizeStyle } from "../../src/elements/style";

describe("sanitizeStyle", () => {
  it("preserves allowed properties", () => {
    const out = sanitizeStyle({
      base: { color: "#333", "font-size": "16px", "font-family": "Helvetica" },
    });
    expect(out.base).toEqual({ color: "#333", "font-size": "16px", "font-family": "Helvetica" });
  });

  it("drops position", () => {
    const out = sanitizeStyle({ base: { position: "fixed", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
    expect("position" in out.base).toBe(false);
  });

  it("drops position:absolute", () => {
    const out = sanitizeStyle({ base: { position: "absolute", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("drops transform", () => {
    const out = sanitizeStyle({ base: { transform: "translateY(-100px)", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("drops pointer-events", () => {
    const out = sanitizeStyle({ base: { "pointer-events": "none", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("drops z-index", () => {
    const out = sanitizeStyle({ base: { "z-index": "999", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("drops inset properties", () => {
    const out = sanitizeStyle({ base: { top: "0", left: "0", color: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("drops right and bottom", () => {
    const out = sanitizeStyle({ base: { right: "0", bottom: "0", color: "#fff" } });
    expect(out.base).toEqual({ color: "#fff" });
  });

  it("drops inset shorthand", () => {
    const out = sanitizeStyle({ base: { inset: "0 0 0 0", color: "#fff" } });
    expect(out.base).toEqual({ color: "#fff" });
  });

  it("drops layout and decoration properties that belong to the merchant container", () => {
    const out = sanitizeStyle({
      base: {
        color: "#111",
        border: "1px solid red",
        padding: "12px",
        margin: "4px",
        "box-shadow": "0 0 0 1px red",
        "background-image": "url(https://example.com/a.png)",
      },
    });
    expect(out.base).toEqual({ color: "#111" });
  });

  it("drops disallowed custom properties", () => {
    const out = sanitizeStyle({
      base: {
        "--arcpay-placeholder-color": "#999",
        "--merchant-private-token": "secret",
      },
    });
    expect(out.base).toEqual({ "--arcpay-placeholder-color": "#999" });
  });

  it("sanitizes invalid + focus blocks too", () => {
    const out = sanitizeStyle({
      base: { color: "#333" },
      invalid: { color: "#fa755a", position: "fixed" },
      focus: { "border-color": "#06c", transform: "scale(1.1)" },
    });
    expect(out.invalid).toEqual({ color: "#fa755a" });
    expect(out.focus).toEqual({});
  });

  it("is case-insensitive on property names and returns canonical CSS keys", () => {
    const out = sanitizeStyle({ base: { Position: "fixed", COLOR: "#333" } });
    expect(out.base).toEqual({ color: "#333" });
  });

  it("omits invalid/focus keys when not provided", () => {
    const out = sanitizeStyle({ base: { color: "#333" } });
    expect("invalid" in out).toBe(false);
    expect("focus" in out).toBe(false);
  });

  it("preserves empty invalid/focus blocks when provided", () => {
    const out = sanitizeStyle({ base: { color: "#333" }, invalid: {}, focus: {} });
    expect(out.invalid).toEqual({});
    expect(out.focus).toEqual({});
  });
});

describe("buildStyleFromAppearance", () => {
  it("defaults to a neutral, unbranded hosted-field input", () => {
    expect(buildStyleFromAppearance()).toEqual({ base: {} });
  });

  it("maps appearance variables to iframe-safe input styles", () => {
    const out = buildStyleFromAppearance({
      variables: {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "16px",
        colorText: "#111827",
        colorPlaceholder: "#9ca3af",
        colorDanger: "#dc2626",
        caretColor: "#111827",
      },
    });

    expect(out).toEqual({
      base: {
        "font-family": "Inter, system-ui, sans-serif",
        "font-size": "16px",
        color: "#111827",
        "--arcpay-placeholder-color": "#9ca3af",
        "caret-color": "#111827",
      },
      invalid: { color: "#dc2626" },
    });
  });

  it("applies typed rules after variables and keeps only iframe-safe properties", () => {
    const out = buildStyleFromAppearance({
      variables: {
        colorText: "#111827",
        colorDanger: "#dc2626",
      },
      rules: {
        base: { color: "#222", border: "1px solid red" },
        focus: { "font-weight": "600", transform: "scale(1.2)" },
        invalid: { color: "#b91c1c" },
      },
    });

    expect(out).toEqual({
      base: { color: "#222" },
      focus: { "font-weight": "600" },
      invalid: { color: "#b91c1c" },
    });
  });

  it("supports an explicit Arc Pay preset without making it the default", () => {
    expect(buildStyleFromAppearance({ theme: "arcpay" }).base).toMatchObject({
      "font-family": expect.stringContaining("system-ui"),
      "font-size": "16px",
      color: "#111827",
    });
  });
});
