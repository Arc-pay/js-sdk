import { describe, it, expect } from "vitest";
import { luhnCheck } from "../../src/tokenize/luhn";

describe("luhnCheck", () => {
  it.each([
    "4242424242424242",
    "5555555555554444",
    "378282246310005",
    "6011111111111117",
    "2200000000000004",
  ])("passes for valid PAN %s", (pan) => {
    expect(luhnCheck(pan)).toBe(true);
  });

  it.each(["4242424242424241", "0000000000000000", "1111111111111111"])(
    "fails for invalid PAN %s",
    (pan) => {
      expect(luhnCheck(pan)).toBe(false);
    },
  );

  it("returns false for non-digit input", () => {
    expect(luhnCheck("4242 4242 4242 4242")).toBe(false);
    expect(luhnCheck("abcd")).toBe(false);
    expect(luhnCheck("")).toBe(false);
  });
});
