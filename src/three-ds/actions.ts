import type { PaymentNextAction } from "../server/types";

export type ThreeDSAction = PaymentNextAction;

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
