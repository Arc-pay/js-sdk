import { describe, it, expect } from "vitest";
import { ArcPayError, isValidationError, isApiError } from "../../src/core/errors";

describe("ArcPayError", () => {
  it("captures all fields", () => {
    const err = new ArcPayError({
      type: "validation_error",
      code: "invalid_card_number",
      message: "Card number failed Luhn check",
      param: "pan",
      paymentId: "pay_123",
      retryable: false,
    });
    expect(err.type).toBe("validation_error");
    expect(err.code).toBe("invalid_card_number");
    expect(err.param).toBe("pan");
    expect(err.paymentId).toBe("pay_123");
    expect(err.retryable).toBe(false);
    expect(err instanceof Error).toBe(true);
    expect(err.message).toBe("Card number failed Luhn check");
  });

  it("isValidationError narrows correctly", () => {
    const err = new ArcPayError({ type: "validation_error", message: "bad", retryable: false });
    expect(isValidationError(err)).toBe(true);
    expect(isApiError(err)).toBe(false);
  });

  it("isApiError narrows correctly", () => {
    const err = new ArcPayError({
      type: "api_error",
      message: "card_declined",
      declineCode: "insufficient_funds",
      retryable: false,
    });
    expect(isApiError(err)).toBe(true);
    expect(err.declineCode).toBe("insufficient_funds");
  });
});
