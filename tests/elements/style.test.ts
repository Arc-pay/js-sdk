import { describe, it, expect } from "vitest";
import { sanitizeStyle } from "../../src/elements/style";

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

  it("sanitizes invalid + focus blocks too", () => {
    const out = sanitizeStyle({
      base: { color: "#333" },
      invalid: { color: "#fa755a", position: "fixed" },
      focus: { "border-color": "#06c", transform: "scale(1.1)" },
    });
    expect(out.invalid).toEqual({ color: "#fa755a" });
    expect(out.focus).toEqual({ "border-color": "#06c" });
  });

  it("is case-insensitive on property names", () => {
    const out = sanitizeStyle({ base: { Position: "fixed", COLOR: "#333" } });
    expect(out.base).toEqual({ COLOR: "#333" });
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
