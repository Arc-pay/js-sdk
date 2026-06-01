import type { StyleSubset } from "./postmessage";
import { ArcPayError } from "../core/errors";

export type HostedFieldsTheme = "none" | "arcpay";

export interface HostedFieldsAppearanceVariables {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  colorText?: string;
  colorPlaceholder?: string;
  colorDanger?: string;
  colorSuccess?: string;
  colorBackground?: string;
  caretColor?: string;
}

export type HostedFieldsAppearanceRule = "base" | "focus" | "invalid" | "complete" | "empty";

export interface HostedFieldsAppearance {
  theme?: HostedFieldsTheme;
  variables?: HostedFieldsAppearanceVariables;
  rules?: Partial<Record<HostedFieldsAppearanceRule, Record<string, string>>>;
}

const ALLOWED_PROPERTIES = new Set([
  "--arcpay-placeholder-color",
  "background-color",
  "caret-color",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "opacity",
  "text-align",
  "text-decoration",
  "text-transform",
]);

const ARCPAY_THEME: StyleSubset = {
  base: {
    "font-family":
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "font-size": "16px",
    "line-height": "24px",
    color: "#111827",
    "--arcpay-placeholder-color": "#9ca3af",
    "caret-color": "#111827",
  },
  focus: {
    color: "#111827",
  },
  invalid: {
    color: "#dc2626",
  },
  complete: {
    color: "#111827",
  },
  empty: {
    color: "#111827",
  },
};

const mergeBlock = (
  target: Record<string, string> | undefined,
  source: Record<string, string> | undefined,
): Record<string, string> | undefined => {
  if (!target && !source) return undefined;
  return { ...(target ?? {}), ...(source ?? {}) };
};

const setIfPresent = (
  block: Record<string, string>,
  key: string,
  value: string | undefined,
): void => {
  if (value !== undefined) block[key] = value;
};

const assertKnownTheme = (theme: HostedFieldsTheme | undefined): void => {
  if (theme === undefined || theme === "none" || theme === "arcpay") return;
  throw new ArcPayError({
    type: "validation_error",
    code: "invalid_hosted_fields_theme",
    message: `Unsupported Hosted Fields appearance theme: ${String(theme)}`,
    retryable: false,
  });
};

const sanitizeBlock = (block: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(block)) {
    const normalizedKey = key.toLowerCase();
    if (!ALLOWED_PROPERTIES.has(normalizedKey)) {
      continue;
    }
    out[normalizedKey] = value;
  }
  return out;
};

export const sanitizeStyle = (style: StyleSubset): StyleSubset => {
  const result: StyleSubset = { base: sanitizeBlock(style.base) };
  if (style.invalid !== undefined) result.invalid = sanitizeBlock(style.invalid);
  if (style.focus !== undefined) result.focus = sanitizeBlock(style.focus);
  if (style.complete !== undefined) result.complete = sanitizeBlock(style.complete);
  if (style.empty !== undefined) result.empty = sanitizeBlock(style.empty);
  return result;
};

export const buildStyleFromAppearance = (appearance?: HostedFieldsAppearance): StyleSubset => {
  assertKnownTheme(appearance?.theme);
  const themeStyle: StyleSubset = appearance?.theme === "arcpay" ? ARCPAY_THEME : { base: {} };
  const variableStyle: StyleSubset = { base: {} };
  const variables = appearance?.variables;

  if (variables) {
    setIfPresent(variableStyle.base, "font-family", variables.fontFamily);
    setIfPresent(variableStyle.base, "font-size", variables.fontSize);
    setIfPresent(variableStyle.base, "font-weight", variables.fontWeight);
    setIfPresent(variableStyle.base, "font-style", variables.fontStyle);
    setIfPresent(variableStyle.base, "line-height", variables.lineHeight);
    setIfPresent(variableStyle.base, "letter-spacing", variables.letterSpacing);
    setIfPresent(variableStyle.base, "text-align", variables.textAlign);
    setIfPresent(variableStyle.base, "color", variables.colorText);
    setIfPresent(variableStyle.base, "--arcpay-placeholder-color", variables.colorPlaceholder);
    setIfPresent(variableStyle.base, "background-color", variables.colorBackground);
    setIfPresent(variableStyle.base, "caret-color", variables.caretColor);

    if (variables.colorDanger !== undefined) {
      variableStyle.invalid = { color: variables.colorDanger };
    }
    if (variables.colorSuccess !== undefined) {
      variableStyle.complete = { color: variables.colorSuccess };
    }
  }

  const rules = appearance?.rules;
  const combined: StyleSubset = {
    base: {
      ...themeStyle.base,
      ...variableStyle.base,
      ...(rules?.base ?? {}),
    },
  };

  const focus = mergeBlock(mergeBlock(themeStyle.focus, variableStyle.focus), rules?.focus);
  const invalid = mergeBlock(mergeBlock(themeStyle.invalid, variableStyle.invalid), rules?.invalid);
  const complete = mergeBlock(
    mergeBlock(themeStyle.complete, variableStyle.complete),
    rules?.complete,
  );
  const empty = mergeBlock(mergeBlock(themeStyle.empty, variableStyle.empty), rules?.empty);

  if (focus !== undefined) combined.focus = focus;
  if (invalid !== undefined) combined.invalid = invalid;
  if (complete !== undefined) combined.complete = complete;
  if (empty !== undefined) combined.empty = empty;

  return sanitizeStyle(combined);
};
