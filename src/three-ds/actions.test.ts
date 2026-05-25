import { describe, expect, it } from "vitest";

import {
  buildThreeDSAutoSubmitHtml,
  buildThreeDSBrowserForm,
  isThreeDSChallengeAction,
  isThreeDSMethodAction,
} from "./actions";
import type { PaymentNextAction } from "../server/types";

const methodAction: PaymentNextAction = {
  type: "three_ds_method",
  three_ds: {
    version: "2",
    phase: "method",
    three_ds_server_trans_id: "trans-1",
    completion_endpoint: "/v1/payments/pay-1/complete-3ds-method",
    submit: {
      method: "POST",
      url: "https://acs.example/method",
      target: "hidden_iframe",
      fields: [{ name: "threeDSMethodData", value: "abc&<>" }],
    },
  },
};

const challengeAction: PaymentNextAction = {
  type: "three_ds_challenge",
  three_ds: {
    version: "1",
    phase: "challenge",
    submit: {
      method: "POST",
      url: "https://acs.example/challenge",
      target: "browser",
      fields: [{ name: "PaReq", value: "pareq" }],
    },
  },
};

describe("3DS helpers", () => {
  it("classifies method and challenge actions", () => {
    expect(isThreeDSMethodAction(methodAction)).toBe(true);
    expect(isThreeDSChallengeAction(methodAction)).toBe(false);
    expect(isThreeDSMethodAction(challengeAction)).toBe(false);
    expect(isThreeDSChallengeAction(challengeAction)).toBe(true);
  });

  it("builds normalized browser form data", () => {
    expect(buildThreeDSBrowserForm(challengeAction)).toEqual({
      action: "https://acs.example/challenge",
      method: "POST",
      target: "browser",
      fields: [{ name: "PaReq", value: "pareq" }],
    });
  });

  it("builds escaped auto-submit HTML", () => {
    const html = buildThreeDSAutoSubmitHtml(methodAction);
    expect(html).toContain('target="arcpay-three-ds-method"');
    expect(html).toContain('name="threeDSMethodData"');
    expect(html).toContain('value="abc&amp;&lt;&gt;"');
    expect(html).toContain("document.forms[0].submit()");
  });
});
