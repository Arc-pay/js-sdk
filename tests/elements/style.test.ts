import { describe, it, expect } from "vitest";
import { buildStyleFromAppearance, sanitizeStyle } from "../../src/elements/style";
import { ArcPayError } from "../../src/core/errors";

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

  it("keeps safe input box styling and drops container layout properties", () => {
    const out = sanitizeStyle({
      base: {
        color: "#111",
        border: "0",
        "border-bottom": "1px solid #fff",
        "border-color": "#fff",
        "border-radius": "6px",
        "box-shadow": "none",
        "box-sizing": "border-box",
        height: "44px",
        outline: "none",
        "outline-offset": "2px",
        padding: "12px",
        margin: "4px",
        "background-image": "url(https://example.com/a.png)",
      },
    });
    expect(out.base).toEqual({
      color: "#111",
      border: "0",
      "border-bottom": "1px solid #fff",
      "border-color": "#fff",
      "border-radius": "6px",
      "box-shadow": "none",
      "box-sizing": "border-box",
      height: "44px",
      outline: "none",
      "outline-offset": "2px",
      padding: "12px",
    });
    expect("margin" in out.base).toBe(false);
    expect("background-image" in out.base).toBe(false);
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
    expect(out.focus).toEqual({ "border-color": "#06c" });
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
        border: "0",
        borderRadius: "6px",
        boxShadow: "none",
        height: "44px",
        padding: "10px 12px",
        outline: "none",
      },
    });

    expect(out).toEqual({
      base: {
        "font-family": "Inter, system-ui, sans-serif",
        "font-size": "16px",
        color: "#111827",
        "--arcpay-placeholder-color": "#9ca3af",
        "caret-color": "#111827",
        border: "0",
        "border-radius": "6px",
        "box-shadow": "none",
        height: "44px",
        padding: "10px 12px",
        outline: "none",
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
        focus: { "font-weight": "600", "box-shadow": "0 0 0 2px #06c", transform: "scale(1.2)" },
        invalid: { color: "#b91c1c" },
      },
    });

    expect(out).toEqual({
      base: { color: "#222", border: "1px solid red" },
      focus: { "font-weight": "600", "box-shadow": "0 0 0 2px #06c" },
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

  it("lets text variables override non-error Arc Pay preset state colors", () => {
    const out = buildStyleFromAppearance({
      theme: "arcpay",
      variables: {
        colorText: "#123456",
      },
    });

    expect(out.base.color).toBe("#123456");
    expect(out.focus?.color).toBe("#123456");
    expect(out.empty?.color).toBe("#123456");
    expect(out.complete?.color).toBe("#123456");
    expect(out.invalid?.color).toBe("#dc2626");
  });

  it("rejects unknown themes instead of silently falling back", () => {
    expect(() => buildStyleFromAppearance({ theme: "legacy" as "none" | "arcpay" })).toThrowError(
      ArcPayError,
    );
  });
});
