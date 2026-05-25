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

export const buildThreeDSBrowserForm = (nextAction: PaymentNextAction): BrowserPostForm => ({
  action: nextAction.three_ds.submit.url,
  method: nextAction.three_ds.submit.method,
  target: nextAction.three_ds.submit.target,
  fields: nextAction.three_ds.submit.fields,
});
