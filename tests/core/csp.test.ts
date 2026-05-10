import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCspAllowsApiBase } from "../../src/core/csp";
import { ArcPayError } from "../../src/core/errors";

const setMetaCsp = (value: string | null) => {
  document.head
    .querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
    .forEach((n) => n.remove());
  if (value !== null) {
    const m = document.createElement("meta");
    m.setAttribute("http-equiv", "Content-Security-Policy");
    m.setAttribute("content", value);
    document.head.appendChild(m);
  }
};

describe("csp", () => {
  beforeEach(() => setMetaCsp(null));
  afterEach(() => setMetaCsp(null));

  it("passes when no CSP meta present", () => {
    expect(() => verifyCspAllowsApiBase("https://api.arcpay.space")).not.toThrow();
  });

  it("passes when connect-src includes api host", () => {
    setMetaCsp("default-src 'self'; connect-src 'self' https://api.arcpay.space");
    expect(() => verifyCspAllowsApiBase("https://api.arcpay.space")).not.toThrow();
  });

  it("passes when wildcard connect-src", () => {
    setMetaCsp("connect-src *");
    expect(() => verifyCspAllowsApiBase("https://api.arcpay.space")).not.toThrow();
  });

  it("throws when connect-src present but api host missing", () => {
    setMetaCsp("default-src 'self'; connect-src 'self'");
    expect(() => verifyCspAllowsApiBase("https://api.arcpay.space")).toThrowError(ArcPayError);
  });
});
