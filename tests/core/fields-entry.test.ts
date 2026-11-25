import { describe, expect, it } from "vitest";
import * as fields from "../../src/fields";
import { ArcPay } from "../../src/core/arcpay";
import { ArcPayError } from "../../src/core/errors";

describe("Hosted Fields only CDN entry", () => {
  it("exports exactly ArcPay and ArcPayError so the 3DS and transfer code stays out of the bundle", () => {
    expect(Object.keys(fields).sort()).toEqual(["ArcPay", "ArcPayError"]);
    expect(fields.ArcPay).toBe(ArcPay);
    expect(fields.ArcPayError).toBe(ArcPayError);
  });
});
