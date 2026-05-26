import type { PaymentNextAction } from "../server/types";
import type { ExecutePaymentRequest } from "../server/types";

export type ThreeDSAction = PaymentNextAction;
export type BrowserInfo = ExecutePaymentRequest["browser_info"];

export interface BrowserFormField {
  name: string;
  value: string;
}

export interface BrowserPostForm {
  action: string;
  method: "POST";
  target: "hidden_iframe" | "browser";
  fields: BrowserFormField[];
}

export interface ThreeDSBrowserStep {
  kind: "method" | "challenge";
  protocolVersion: "1" | "2";
  form: BrowserPostForm;
  completionEndpoint?: string;
  threeDSServerTransId?: string;
}

const supportedColorDepths = [1, 4, 8, 15, 16, 24, 32, 48] as const;

const normalizeColorDepth = (value: number): BrowserInfo["color_depth"] =>
  supportedColorDepths.includes(value as BrowserInfo["color_depth"])
    ? (value as BrowserInfo["color_depth"])
    : 24;

const resolveWindowSize = (width: number): NonNullable<BrowserInfo["window_size"]> => {
  if (width >= 1000) return "05";
  if (width >= 600) return "04";
  if (width >= 500) return "03";
  if (width >= 390) return "02";
  return "01";
};

export const collectBrowserInfo = (
  acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
): BrowserInfo => {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof screen === "undefined"
  ) {
    throw new Error("collectBrowserInfo must be called in a browser environment");
  }
  return {
    accept_header: acceptHeader,
    language: navigator.language || "en",
    screen_width: screen.width,
    screen_height: screen.height,
    color_depth: normalizeColorDepth(screen.colorDepth),
    timezone_offset_minutes: new Date().getTimezoneOffset(),
    java_enabled: false,
    user_agent: navigator.userAgent,
    window_size: resolveWindowSize(window.innerWidth || screen.width),
  };
};

export const getThreeDSAction = (nextAction?: PaymentNextAction): PaymentNextAction | null => {
  return nextAction ?? null;
};

export const isThreeDSMethodAction = (nextAction?: PaymentNextAction): boolean => {
  return nextAction?.type === "three_ds_method" && nextAction.three_ds.phase === "method";
};

export const isThreeDSChallengeAction = (nextAction?: PaymentNextAction): boolean => {
  return nextAction?.type === "three_ds_challenge" && nextAction.three_ds.phase === "challenge";
};

export const buildThreeDSBrowserForm = (nextAction: PaymentNextAction): BrowserPostForm => ({
  action: nextAction.three_ds.submit.url,
  method: nextAction.three_ds.submit.method,
  target: nextAction.three_ds.submit.target,
  fields: nextAction.three_ds.submit.fields,
});

export const buildThreeDSBrowserStep = (
  nextAction?: PaymentNextAction,
): ThreeDSBrowserStep | null => {
  const action = getThreeDSAction(nextAction);
  if (!action) return null;
  return {
    kind: action.three_ds.phase,
    protocolVersion: action.three_ds.version,
    form: buildThreeDSBrowserForm(action),
    completionEndpoint: action.three_ds.completion_endpoint,
    threeDSServerTransId: action.three_ds.three_ds_server_trans_id,
  };
};

export const buildThreeDSMethodCompletion = (
  nextAction: PaymentNextAction,
  completionIndicator: "Y" | "N" | "U" = "Y",
): { completion_indicator: "Y" | "N" | "U"; three_ds_server_trans_id: string } => {
  if (!isThreeDSMethodAction(nextAction) || !nextAction.three_ds.three_ds_server_trans_id) {
    throw new Error("nextAction must be a three_ds_method action with three_ds_server_trans_id");
  }
  return {
    completion_indicator: completionIndicator,
    three_ds_server_trans_id: nextAction.three_ds.three_ds_server_trans_id,
  };
};

const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildThreeDSAutoSubmitHtml = (nextAction: PaymentNextAction): string => {
  const form = buildThreeDSBrowserForm(nextAction);
  const target = form.target === "hidden_iframe" ? "arcpay-three-ds-method" : "_self";
  const inputs = form.fields
    .map(
      (field) =>
        `<input type="hidden" name="${htmlEscape(field.name)}" value="${htmlEscape(field.value)}">`,
    )
    .join("");
  const iframe =
    form.target === "hidden_iframe"
      ? '<iframe name="arcpay-three-ds-method" title="3-D Secure method" hidden></iframe>'
      : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${iframe}<form method="POST" action="${htmlEscape(form.action)}" target="${target}">${inputs}</form><script>document.forms[0].submit();</script></body></html>`;
};
