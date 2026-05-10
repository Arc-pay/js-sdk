import { describe, it, expect } from "vitest";
import { detectScheme } from "../../src/tokenize/scheme";

describe("detectScheme", () => {
  it.each([
    ["4242424242424242", "visa"],
    ["5555555555554444", "mastercard"],
    ["2221001234567890", "mastercard"],
    ["378282246310005", "amex"],
    ["6011111111111117", "discover"],
    ["2200000000000004", "mir"],
    ["3528000000000007", "jcb"],
    ["6200000000000005", "unionpay"],
    ["9999999999999999", "unknown"],
  ])("detects %s as %s", (pan, scheme) => {
    expect(detectScheme(pan)).toBe(scheme);
  });
});
