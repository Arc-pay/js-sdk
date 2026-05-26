import { describe, expect, it } from "vitest";
import {
  buildThreeDSBrowserForm,
  buildThreeDSBrowserStep,
  buildThreeDSMethodCompletion,
  getThreeDSAction,
} from "../../src/three-ds";
import type { PaymentNextAction } from "../../src/server";

describe("3DS next action helpers", () => {
  it("returns null when no browser action is required", () => {
    expect(getThreeDSAction(undefined)).toBeNull();
  });

  it("builds a standardized 3DS Method form", () => {
    const action: PaymentNextAction = {
      type: "three_ds_method",
      three_ds: {
        version: "2",
        phase: "method",
        three_ds_server_trans_id: "trans-id",
        completion_endpoint: "/v1/payments/pay_1/complete-3ds-method",
        submit: {
          method: "POST",
          url: "https://method.bank.example",
          target: "hidden_iframe",
          fields: [{ name: "threeDSMethodData", value: "method-data" }],
        },
      },
    };

    expect(getThreeDSAction(action)).toBe(action);
    expect(buildThreeDSBrowserForm(action)).toEqual({
      action: "https://method.bank.example",
      method: "POST",
      target: "hidden_iframe",
      fields: [{ name: "threeDSMethodData", value: "method-data" }],
    });
    expect(buildThreeDSBrowserStep(action)).toEqual({
      kind: "method",
      protocolVersion: "2",
      completionEndpoint: "/v1/payments/pay_1/complete-3ds-method",
      threeDSServerTransId: "trans-id",
      form: {
        action: "https://method.bank.example",
        method: "POST",
        target: "hidden_iframe",
        fields: [{ name: "threeDSMethodData", value: "method-data" }],
      },
    });
    expect(buildThreeDSMethodCompletion(action, "N")).toEqual({
      completion_indicator: "N",
      three_ds_server_trans_id: "trans-id",
    });
  });

  it("builds a standardized ACS challenge form", () => {
    const action: PaymentNextAction = {
      type: "three_ds_challenge",
      three_ds: {
        version: "1",
        phase: "challenge",
        submit: {
          method: "POST",
          url: "https://acs.bank.example",
          target: "browser",
          fields: [
            { name: "PaReq", value: "pa-req" },
            { name: "MD", value: "md" },
            { name: "TermUrl", value: "https://api.arcpay.space/v1/3ds-callback" },
          ],
        },
      },
    };

    expect(buildThreeDSBrowserForm(action)).toEqual({
      action: "https://acs.bank.example",
      method: "POST",
      target: "browser",
      fields: [
        { name: "PaReq", value: "pa-req" },
        { name: "MD", value: "md" },
        { name: "TermUrl", value: "https://api.arcpay.space/v1/3ds-callback" },
      ],
    });
  });
});
