import { describe, expect, it } from "vitest";
import { isIdempotencyKey, newIdempotencyKey } from "../../src";

describe("idempotency helpers", () => {
  it("generates UUIDv7 idempotency keys", () => {
    const key = newIdempotencyKey();

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isIdempotencyKey(key)).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("accepts API-compatible UUID v%i", (version) => {
    expect(isIdempotencyKey(`550e8400-e29b-${version}1d4-a716-446655440000`)).toBe(true);
  });

  it("accepts uppercase UUIDs", () => {
    expect(isIdempotencyKey("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it.each([
    "550e8400-e29b-01d4-a716-446655440000",
    "550e8400-e29b-91d4-a716-446655440000",
    "550e8400-e29b-41d4-7716-446655440000",
    "550e8400-e29b-41d4-c716-446655440000",
    "550e8400e29b41d4a716446655440000",
    "550e8400-e29b-41d4-a716-446655440000\n",
    "",
  ])("rejects invalid UUID %j", (key) => {
    expect(isIdempotencyKey(key)).toBe(false);
  });
});
