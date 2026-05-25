import { describe, expect, it } from "vitest";

import {
  buildThreeDSAutoSubmitHtml,
  buildThreeDSBrowserForm,
  collectBrowserInfo,
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

  it("collects normalized browser info", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window.screen, "width", { configurable: true, value: 1440 });
    Object.defineProperty(window.screen, "height", { configurable: true, value: 900 });
    Object.defineProperty(window.screen, "colorDepth", { configurable: true, value: 30 });
    Object.defineProperty(window.navigator, "language", { configurable: true, value: "ru-RU" });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "test-agent",
    });

    expect(collectBrowserInfo("text/html")).toMatchObject({
      accept_header: "text/html",
      language: "ru-RU",
      screen_width: 1440,
      screen_height: 900,
      color_depth: 24,
      java_enabled: false,
      user_agent: "test-agent",
      window_size: "05",
    });
  });
});
