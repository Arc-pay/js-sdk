import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { validateTokenizeRequest } from "../../src/tokenize/validate";
import { ArcPayError } from "../../src/core/errors";

describe("validateTokenizeRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const valid = {
    pan: "4242424242424242",
    cvv: "123",
    expiryMonth: "12",
    expiryYear: "2030",
  };

  it("accepts valid Visa", () => {
    expect(() => validateTokenizeRequest(valid)).not.toThrow();
  });

  it("rejects PAN failing Luhn", () => {
    expect(() => validateTokenizeRequest({ ...valid, pan: "4242424242424241" })).toThrowError(
      /luhn/i,
    );
  });

  it("rejects PAN with non-digits", () => {
    expect(() => validateTokenizeRequest({ ...valid, pan: "4242-4242-4242-4242" })).toThrowError(
      ArcPayError,
    );
  });

  it("rejects PAN length < 13 or > 19", () => {
    expect(() => validateTokenizeRequest({ ...valid, pan: "4242424242" })).toThrow();
    expect(() => validateTokenizeRequest({ ...valid, pan: "4".repeat(20) })).toThrow();
  });

  it("rejects 4-digit CVV for Visa (3 expected)", () => {
    expect(() => validateTokenizeRequest({ ...valid, cvv: "1234" })).toThrowError(/cvv/i);
  });

  it("accepts 4-digit CVV for Amex BIN", () => {
    expect(() =>
      validateTokenizeRequest({ ...valid, pan: "378282246310005", cvv: "1234" }),
    ).not.toThrow();
  });

  it("rejects expired card", () => {
    expect(() =>
      validateTokenizeRequest({ ...valid, expiryMonth: "04", expiryYear: "2026" }),
    ).toThrowError(/expir/i);
  });

  it("accepts current month", () => {
    expect(() =>
      validateTokenizeRequest({ ...valid, expiryMonth: "05", expiryYear: "2026" }),
    ).not.toThrow();
  });

  it("rejects expiryYear too far in future (>20yr)", () => {
    expect(() => validateTokenizeRequest({ ...valid, expiryYear: "2099" })).toThrowError(/expir/i);
  });

  it("rejects month out of range", () => {
    expect(() => validateTokenizeRequest({ ...valid, expiryMonth: "13" })).toThrow();
    expect(() => validateTokenizeRequest({ ...valid, expiryMonth: "00" })).toThrow();
  });
});
