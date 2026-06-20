import { describe, expect, it } from "vitest";
import {
  buildThreeDSBrowserForm,
  buildThreeDSBrowserStep,
  buildThreeDSMethodCompletion,
  confirmWalletPayment,
  confirmPayment,
  getThreeDSAction,
  handleNextAction,
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
    const browserInfo = {
      accept_header: "text/html",
      language: "ru-RU",
      screen_width: 1440,
      screen_height: 900,
      color_depth: 24 as const,
      timezone_offset_minutes: -180,
      java_enabled: false,
      user_agent: "Mozilla/5.0",
      window_size: "04" as const,
    };

    const resultPromise = runThreeDSBrowserFlow(methodAction, {
      methodTimeoutMs: 1000,
      browserInfo,
      submitter: (form) => submitted.push(form.action),
      completeThreeDSMethod: async (completion) => {
        expect(completion).toEqual({
          completion_indicator: "Y",
          three_ds_server_trans_id: "trans-id",
          browser_info: browserInfo,
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

  it("reports unknown 3DS Method completion on method timeout", async () => {
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

    const result = await runThreeDSBrowserFlow(methodAction, {
      methodTimeoutMs: 1,
      submitter: () => undefined,
      completeThreeDSMethod: async (completion) => {
        expect(completion.completion_indicator).toBe("U");
        return {
          payment_id: "pay_1",
          status: "pending_3ds",
        };
      },
    });

    expect(result.status).toBe("method_completed");
    if (result.status === "method_completed") {
      expect(result.methodResult).toBe("timeout");
    }
  });

  it("confirms a payment and returns a terminal status without bank-specific branches", async () => {
    const result = await confirmPayment({
      paymentId: "pay_1",
      cardTokenId: "card_token_1",
      browserInfo: {
        accept_header: "text/html",
        language: "ru-RU",
        screen_width: 390,
        screen_height: 844,
        color_depth: 24,
        timezone_offset_minutes: -180,
        user_agent: "test",
        window_size: "02",
      },
      executePayment: async (request) => {
        expect(request).toMatchObject({
          payment_method: "bank_card",
          payment_mode: "h2h",
          card_token_id: "card_token_1",
        });
        return {
          payment_id: "pay_1",
          status: "captured",
        };
      },
    });

    expect(result).toEqual({
      status: "terminal",
      paymentId: "pay_1",
      paymentStatus: "captured",
      payment: undefined,
      response: {
        payment_id: "pay_1",
        status: "captured",
      },
      threeDS: undefined,
    });
  });

  it("uses the server-observed Accept header for execute and 3DS Method completion", async () => {
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
    const acceptHeader =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8";

    const resultPromise = confirmPayment({
      paymentId: "pay_1",
      cardTokenId: "card_token_1",
      browserAcceptHeader: acceptHeader,
      methodTimeoutMs: 1000,
      submitter: () => undefined,
      executePayment: async (request) => {
        expect(request.browser_info.accept_header).toBe(acceptHeader);
        return {
          payment_id: "pay_1",
          status: "pending_3ds_method",
          next_action: methodAction,
        };
      },
      completeThreeDSMethod: async (completion) => {
        expect(completion.browser_info?.accept_header).toBe(acceptHeader);
        return {
          payment_id: "pay_1",
          status: "pending_3ds",
        };
      },
    });

    document.querySelector("iframe")?.dispatchEvent(new Event("load"));
    const result = await resultPromise;

    expect(result.status).toBe("non_terminal");
  });

  it("confirms an SBP wallet payment and returns a normalized QR action", async () => {
    const result = await confirmWalletPayment({
      paymentId: "pay_sbp_1",
      paymentMethod: "sbp",
      walletInteraction: {
        provider: "sbp",
        surface: "merchant_web",
        action: "qr",
        back_url: "https://merchant.example/return",
      },
      executePayment: async (request) => {
        expect(request).toEqual({
          payment_method: "sbp",
          payment_mode: "h2h",
          wallet_interaction: {
            provider: "sbp",
            surface: "merchant_web",
            action: "qr",
            back_url: "https://merchant.example/return",
          },
        });
        return {
          payment_id: "pay_sbp_1",
          status: "pending",
          payment_mode: "h2h",
          wallet_action: {
            provider: "sbp",
            action: "qr",
            qr_url: "https://qr.nspk.ru/BD10006GQ7T2N9M9876543210",
            qr_image_base64: "iVBORw0KGgo=",
            qr_content_type: "image/png",
            bank_invoice_id: "qrc-123",
            back_url: "https://merchant.example/return",
            params: { expires_in: "900" },
          },
        };
      },
    });

    expect(result).toEqual({
      status: "wallet_action",
      paymentId: "pay_sbp_1",
      paymentStatus: "pending",
      response: {
        payment_id: "pay_sbp_1",
        status: "pending",
        payment_mode: "h2h",
        wallet_action: {
          provider: "sbp",
          action: "qr",
          qr_url: "https://qr.nspk.ru/BD10006GQ7T2N9M9876543210",
          qr_image_base64: "iVBORw0KGgo=",
          qr_content_type: "image/png",
          bank_invoice_id: "qrc-123",
          back_url: "https://merchant.example/return",
          params: { expires_in: "900" },
        },
      },
      walletAction: {
        provider: "sbp",
        action: "qr",
        qrUrl: "https://qr.nspk.ru/BD10006GQ7T2N9M9876543210",
        qrImageBase64: "iVBORw0KGgo=",
        qrContentType: "image/png",
        bankInvoiceId: "qrc-123",
        backUrl: "https://merchant.example/return",
        params: { expires_in: "900" },
      },
    });
  });

  it("treats failed SBP execute responses as terminal wallet results", async () => {
    const result = await confirmWalletPayment({
      paymentId: "pay_sbp_failed",
      paymentMethod: "sbp",
      walletInteraction: { provider: "sbp", surface: "merchant_web", action: "qr" },
      executePayment: async () => ({
        payment_id: "pay_sbp_failed",
        status: "failed",
        decline_code: "sbp_merchant_not_found",
        decline_message: "SBP payments are not configured for this terminal",
      }),
    });

    expect(result).toEqual({
      status: "terminal",
      paymentId: "pay_sbp_failed",
      paymentStatus: "failed",
      response: {
        payment_id: "pay_sbp_failed",
        status: "failed",
        decline_code: "sbp_merchant_not_found",
        decline_message: "SBP payments are not configured for this terminal",
      },
    });
  });

  it("returns non_terminal when SBP execute has no wallet action yet", async () => {
    const result = await confirmWalletPayment({
      paymentId: "pay_sbp_pending",
      paymentMethod: "sbp",
      walletInteraction: { provider: "sbp", surface: "merchant_web", action: "qr" },
      executePayment: async () => ({
        payment_id: "pay_sbp_pending",
        status: "pending",
      }),
    });

    expect(result).toEqual({
      status: "non_terminal",
      paymentId: "pay_sbp_pending",
      paymentStatus: "pending",
      response: {
        payment_id: "pay_sbp_pending",
        status: "pending",
      },
      reason: "awaiting_webhook",
    });
  });

  it("handles a challenge action and resolves through a standard terminal payment poll", async () => {
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

    const result = await handleNextAction({
      paymentId: "pay_1",
      response: {
        payment_id: "pay_1",
        status: "pending_3ds",
        next_action: challengeAction,
      },
      submitter: (form) => submitted.push(form.action),
      waitForPaymentTerminal: async ({ paymentId }) => ({
        id: paymentId,
        amount: 10000,
        currency: "RUB",
        payment_method: "bank_card",
        status: "authorized",
        created_at: "2026-06-02T00:00:00Z",
        updated_at: "2026-06-02T00:00:01Z",
      }),
    });

    expect(submitted).toEqual(["https://acs.bank.example/"]);
    expect(result.status).toBe("terminal");
    if (result.status === "terminal") {
      expect(result.paymentStatus).toBe("authorized");
      expect(result.threeDS?.status).toBe("challenge_submitted");
    }
  });

  it("returns requires_action when the ACS challenge is still buyer-owned", async () => {
    const challengeAction: PaymentNextAction = {
      type: "three_ds_challenge",
      three_ds: {
        version: "1",
        phase: "challenge",
        submit: {
          method: "POST",
          url: "https://acs.bank.example",
          target: "browser",
          fields: [{ name: "PaReq", value: "pa-req" }],
        },
      },
    };

    const result = await handleNextAction({
      paymentId: "pay_1",
      response: {
        payment_id: "pay_1",
        status: "pending_3ds",
        next_action: challengeAction,
      },
      submitter: () => undefined,
    });

    expect(result.status).toBe("requires_action");
    if (result.status === "requires_action") {
      expect(result.nextAction).toBe(challengeAction);
      result.threeDS.mounted.remove();
    }
  });
});
