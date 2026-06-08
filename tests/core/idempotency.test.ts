import { describe, expect, it } from "vitest";
import { isIdempotencyKey, newIdempotencyKey } from "../../src";

describe("idempotency helpers", () => {
  it("generates UUIDv7 idempotency keys", () => {
    const key = newIdempotencyKey();

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isIdempotencyKey(key)).toBe(true);
  });

  it("rejects UUIDv4 idempotency keys", () => {
    expect(isIdempotencyKey("00000000-0000-4000-8000-000000000001")).toBe(false);
  });
});
