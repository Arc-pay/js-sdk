import type { StyleSubset } from "./postmessage";
import { validationError } from "../core/errors";

export type HostedFieldsTheme = "none" | "arcpay" | "arcpay-dark";

export interface HostedFieldsAppearanceVariables {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  /** e.g. "tabular-nums" so card digits keep a constant width while typing. */
  fontVariantNumeric?: string;
  /** OpenType features, e.g. '"tnum" 1'. */
  fontFeatureSettings?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  colorText?: string;
  colorPlaceholder?: string;
  colorDanger?: string;
  colorSuccess?: string;
  colorBackground?: string;
  caretColor?: string;
  border?: string;
  borderColor?: string;
  borderRadius?: string;
  boxShadow?: string;
  height?: string;
  padding?: string;
  outline?: string;
}

export type HostedFieldsAppearanceRule =
  | "base"
  | "focus"
  | "invalid"
  | "complete"
  | "empty"
  | "disabled"
  | "hover"
  | "autofill";

export type HostedFieldsStyleProperty =
  | "--arcpay-placeholder-color"
  | "background-color"
  | "border"
  | "border-bottom"
  | "border-color"
  | "border-left"
  | "border-radius"
  | "border-right"
  | "border-top"
  | "box-shadow"
  | "box-sizing"
  | "caret-color"
  | "color"
  | "color-scheme"
  | "font-family"
  | "font-feature-settings"
  | "font-size"
  | "font-style"
  | "font-variant-numeric"
  | "font-weight"
  | "height"
  | "letter-spacing"
  | "line-height"
  | "opacity"
  | "outline"
  | "outline-color"
  | "outline-offset"
  | "outline-style"
  | "outline-width"
  | "padding"
  | "padding-bottom"
  | "padding-left"
  | "padding-right"
  | "padding-top"
  | "text-align"
  | "text-decoration"
  | "text-transform";

export type HostedFieldsStyleBlock = Partial<Record<HostedFieldsStyleProperty, string>>;

export interface HostedFieldsAppearance {
  theme?: HostedFieldsTheme;
  variables?: HostedFieldsAppearanceVariables;
  rules?: Partial<Record<HostedFieldsAppearanceRule, HostedFieldsStyleBlock>>;
}

const ALLOWED_PROPERTIES = new Set<HostedFieldsStyleProperty>([
  "--arcpay-placeholder-color",
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-top",
  "box-shadow",
  "box-sizing",
  "caret-color",
  "color",
  "color-scheme",
  "font-family",
  "font-feature-settings",
  "font-size",
  "font-style",
  "font-variant-numeric",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "opacity",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-transform",
]);

const isAllowedProperty = (property: string): property is HostedFieldsStyleProperty =>
  ALLOWED_PROPERTIES.has(property as HostedFieldsStyleProperty);

const ARCPAY_THEME: StyleSubset = {
  base: {
    "font-family":
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "font-size": "16px",
    "font-variant-numeric": "tabular-nums",
    "line-height": "24px",
    color: "#111827",
    "--arcpay-placeholder-color": "#6b7280",
    "caret-color": "#111827",
    "color-scheme": "light",
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
  disabled: {
    opacity: "0.6",
  },
};

const ARCPAY_DARK_THEME: StyleSubset = {
  base: {
    ...ARCPAY_THEME.base,
    color: "#f9fafb",
    "--arcpay-placeholder-color": "#9ca3af",
    "caret-color": "#f9fafb",
    "color-scheme": "dark",
  },
  focus: { color: "#f9fafb" },
  invalid: { color: "#f87171" },
  complete: { color: "#f9fafb" },
  empty: { color: "#f9fafb" },
  disabled: { opacity: "0.6" },
};

const THEMES: Record<Exclude<HostedFieldsTheme, "none">, StyleSubset> = {
  arcpay: ARCPAY_THEME,
  "arcpay-dark": ARCPAY_DARK_THEME,
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
  if (theme === undefined || theme === "none" || theme === "arcpay" || theme === "arcpay-dark") {
    return;
  }
  throw validationError("invalid_hosted_fields_theme", `Unsupported Hosted Fields appearance theme: ${String(theme)}`);
};

const MAX_STYLE_VALUE_LENGTH = 512;
// The iframe CSP already blocks external fetches; refusing resource-loading and
// script-ish values here keeps a second layer in front of it.
// ";" is refused too: the iframe renders the autofill block as CSS text, so a value must never
// be able to open a second declaration.
const FORBIDDEN_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|@import|javascript:|[<>{};]/i;

const isSafeValue = (value: string): boolean =>
  value.length <= MAX_STYLE_VALUE_LENGTH && !FORBIDDEN_VALUE.test(value);

const sanitizeBlock = (block: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(block)) {
    const normalizedKey = key.toLowerCase();
    if (!isAllowedProperty(normalizedKey) || !isSafeValue(value)) {
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
  if (style.disabled !== undefined) result.disabled = sanitizeBlock(style.disabled);
  if (style.hover !== undefined) result.hover = sanitizeBlock(style.hover);
  if (style.autofill !== undefined) result.autofill = sanitizeBlock(style.autofill);
  return result;
};

export const buildStyleFromAppearance = (appearance?: HostedFieldsAppearance): StyleSubset => {
  assertKnownTheme(appearance?.theme);
  const themeStyle: StyleSubset =
    appearance?.theme === undefined || appearance.theme === "none"
      ? { base: {} }
      : THEMES[appearance.theme];
  const variableStyle: StyleSubset = { base: {} };
  const variables = appearance?.variables;

  if (variables) {
    setIfPresent(variableStyle.base, "font-family", variables.fontFamily);
    setIfPresent(variableStyle.base, "font-size", variables.fontSize);
    setIfPresent(variableStyle.base, "font-weight", variables.fontWeight);
    setIfPresent(variableStyle.base, "font-style", variables.fontStyle);
    setIfPresent(variableStyle.base, "font-variant-numeric", variables.fontVariantNumeric);
    setIfPresent(variableStyle.base, "font-feature-settings", variables.fontFeatureSettings);
    setIfPresent(variableStyle.base, "line-height", variables.lineHeight);
    setIfPresent(variableStyle.base, "letter-spacing", variables.letterSpacing);
    setIfPresent(variableStyle.base, "text-align", variables.textAlign);
    setIfPresent(variableStyle.base, "color", variables.colorText);
    setIfPresent(variableStyle.base, "--arcpay-placeholder-color", variables.colorPlaceholder);
    setIfPresent(variableStyle.base, "background-color", variables.colorBackground);
    setIfPresent(variableStyle.base, "caret-color", variables.caretColor);
    setIfPresent(variableStyle.base, "border", variables.border);
    setIfPresent(variableStyle.base, "border-color", variables.borderColor);
    setIfPresent(variableStyle.base, "border-radius", variables.borderRadius);
    setIfPresent(variableStyle.base, "box-shadow", variables.boxShadow);
    setIfPresent(variableStyle.base, "height", variables.height);
    setIfPresent(variableStyle.base, "padding", variables.padding);
    setIfPresent(variableStyle.base, "outline", variables.outline);

    if (variables.colorText !== undefined && appearance?.theme !== undefined && appearance.theme !== "none") {
      variableStyle.focus = { color: variables.colorText };
      variableStyle.complete = { color: variables.colorText };
      variableStyle.empty = { color: variables.colorText };
    }
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

  const disabled = mergeBlock(themeStyle.disabled, rules?.disabled);
  const hover = mergeBlock(themeStyle.hover, rules?.hover);
  const autofill = mergeBlock(themeStyle.autofill, rules?.autofill);

  if (disabled !== undefined) combined.disabled = disabled;
  if (hover !== undefined) combined.hover = hover;
  if (autofill !== undefined) combined.autofill = autofill;
  if (focus !== undefined) combined.focus = focus;
  if (invalid !== undefined) combined.invalid = invalid;
  if (complete !== undefined) combined.complete = complete;
  if (empty !== undefined) combined.empty = empty;

  return sanitizeStyle(combined);
};
