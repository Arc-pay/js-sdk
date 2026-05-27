import { describe, expect, it } from "vitest";
import {
  buildThreeDSBrowserForm,
  buildThreeDSBrowserStep,
  buildThreeDSMethodCompletion,
  getThreeDSAction,
  mountThreeDSBrowserForm,
  runThreeDSBrowserFlow,
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

  it("mounts a hidden iframe for 3DS Method and removes it", () => {
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
    const submitted: string[] = [];

    const mounted = mountThreeDSBrowserForm(action, {
      submitter: (form) => submitted.push(form.target),
    });
    mounted.submit();

    expect(submitted[0]).toMatch(/^arcpay-three-ds-method-/);
    expect(mounted.iframe?.name).toBe(submitted[0]);
    expect(document.querySelectorAll("form")).toHaveLength(1);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);

    mounted.remove();
    expect(document.querySelectorAll("form")).toHaveLength(0);
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("completes 3DS Method and submits the returned challenge action", async () => {
    const methodAction: PaymentNextAction = {
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
    const challengeAction: PaymentNextAction = {
      type: "three_ds_challenge",
      three_ds: {
        version: "2",
        phase: "challenge",
        submit: {
          method: "POST",
          url: "https://acs.bank.example",
          target: "browser",
          fields: [{ name: "creq", value: "challenge-data" }],
        },
      },
    };
    const submitted: string[] = [];

    const resultPromise = runThreeDSBrowserFlow(methodAction, {
      methodTimeoutMs: 1000,
      submitter: (form) => submitted.push(form.action),
      completeThreeDSMethod: async (completion) => {
        expect(completion).toEqual({
          completion_indicator: "Y",
          three_ds_server_trans_id: "trans-id",
        });
        return {
          payment_id: "pay_1",
          status: "pending_3ds",
          next_action: challengeAction,
        };
      },
    });

    document.querySelector("iframe")?.dispatchEvent(new Event("load"));
    const result = await resultPromise;

    expect(result.status).toBe("challenge_submitted");
    expect(submitted).toEqual(["https://method.bank.example/", "https://acs.bank.example/"]);
    if (result.status === "challenge_submitted") {
      expect(result.methodResult).toBe("loaded");
      result.mounted.remove();
    }
  });
});
