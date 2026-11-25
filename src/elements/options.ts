import { validationError } from "../core/errors";

/**
 * Runtime options of a Hosted Field. They travel from the merchant page to the
 * secure iframe inside `arcpay:configure` / `arcpay:options` messages and never
 * contain card data. Both sides run `sanitizeRuntimeOptions`: the SDK in strict
 * mode (throws, so integrators see mistakes), the iframe in lenient mode (drops
 * what it does not understand, so an old iframe and a new SDK keep working).
 */

export type HostedFieldsLocale = "auto" | "ru" | "en";
export type HostedFieldsInputName = "cardNumber" | "cardExpiry" | "cardCvv";
export type HostedFieldsExpiryYearFormat = "YY" | "YYYY";

export const HOSTED_FIELD_ISSUE_CODES = [
  "card_number_empty",
  "card_number_incomplete",
  "card_number_invalid",
  "card_expiry_empty",
  "card_expiry_incomplete",
  "card_expiry_invalid_month",
  "card_expiry_expired",
  "card_expiry_too_far",
  "card_cvv_empty",
  "card_cvv_incomplete",
  "card_cvv_invalid",
] as const;

export type HostedFieldIssueCode = (typeof HOSTED_FIELD_ISSUE_CODES)[number];

export interface HostedFieldsTexts {
  /** Placeholder per input. Overrides the localized default. */
  placeholders?: Partial<Record<HostedFieldsInputName, string>>;
  /** Accessible name per input. Overrides the localized default. */
  labels?: Partial<Record<HostedFieldsInputName, string>>;
  /** Text of `issue.message` / the screen-reader error, by issue code. */
  errors?: Partial<Record<HostedFieldIssueCode, string>>;
}

/** Geometry of the composite `card` element. Accepts `0` or a number with px, rem, em or %. */
export interface HostedFieldsLayout {
  gap?: string;
  expiryWidth?: string;
  cvvWidth?: string;
}

export interface HostedFieldsRuntimeOptions {
  /** Language of default texts. `auto` (default) follows the browser. */
  locale?: HostedFieldsLocale;
  texts?: HostedFieldsTexts;
  layout?: HostedFieldsLayout;
  disabled?: boolean;
  readOnly?: boolean;
  /** Focus the field once it is ready. */
  autofocus?: boolean;
  /** Show a card brand badge inside the number input. Default `false`. */
  showBrandIcon?: boolean;
  /** Mask the security code as dots. Default `true`. */
  maskCvv?: boolean;
  /** Display and accept the expiry year as `MM/YY` (default) or `MM/YYYY`. */
  expiryYearFormat?: HostedFieldsExpiryYearFormat;
  /**
   * Move focus on once a field is complete and valid: number -> expiry -> security
   * code. Inside the composite `card` element and across split elements. Default `false`.
   */
  autoAdvance?: boolean;
}

export const RUNTIME_OPTION_KEYS = [
  "locale",
  "texts",
  "layout",
  "disabled",
  "readOnly",
  "autofocus",
  "showBrandIcon",
  "maskCvv",
  "expiryYearFormat",
  "autoAdvance",
] as const satisfies readonly (keyof HostedFieldsRuntimeOptions)[];

const MAX_TEXT_LENGTH = 120;
const INPUTS: readonly HostedFieldsInputName[] = ["cardNumber", "cardExpiry", "cardCvv"];
const LENGTH = /^(0|\d{1,3}(\.\d{1,3})?(px|rem|em|%))$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (code: string, message: string): never => {
  throw validationError(code, message);
};

const sanitizeTextMap = <K extends string>(
  value: unknown,
  keys: readonly K[],
  name: string,
  strict: boolean,
): Partial<Record<K, string>> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    if (strict) fail("invalid_hosted_fields_option", `${name} must be an object`);
    return undefined;
  }
  const out: Partial<Record<K, string>> = {};
  for (const [key, text] of Object.entries(value)) {
    if (!keys.includes(key as K)) {
      if (strict) fail("invalid_hosted_fields_option", `${name}.${key} is not supported`);
      continue;
    }
    if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH || /[<>]/.test(text)) {
      if (strict) {
        fail(
          "invalid_hosted_fields_option",
          `${name}.${key} must be plain text up to ${MAX_TEXT_LENGTH} characters`,
        );
      }
      continue;
    }
    out[key as K] = text;
  }
  return out;
};

const sanitizeLayout = (value: unknown, strict: boolean): HostedFieldsLayout | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    if (strict) fail("invalid_hosted_fields_option", "layout must be an object");
    return undefined;
  }
  const out: HostedFieldsLayout = {};
  for (const key of ["gap", "expiryWidth", "cvvWidth"] as const) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string" || !LENGTH.test(entry.trim())) {
      if (strict) {
        fail(
          "invalid_hosted_fields_option",
          `layout.${key} must be 0 or a number with px, rem, em or %`,
        );
      }
      continue;
    }
    out[key] = entry.trim();
  }
  if (strict) {
    for (const key of Object.keys(value)) {
      if (key !== "gap" && key !== "expiryWidth" && key !== "cvvWidth") {
        fail("invalid_hosted_fields_option", `layout.${key} is not supported`);
      }
    }
  }
  return out;
};

export const sanitizeRuntimeOptions = (
  input: unknown,
  { strict }: { strict: boolean },
): HostedFieldsRuntimeOptions => {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) {
    if (strict) fail("invalid_hosted_fields_option", "Hosted Fields options must be an object");
    return {};
  }
  const out: HostedFieldsRuntimeOptions = {};

  const { locale } = input;
  if (locale !== undefined) {
    const lower = String(locale).toLowerCase();
    const base = lower === "auto" ? lower : /^(ru|en)(-[a-z\d]+)*$/.exec(lower)?.[1];
    if (base) out.locale = base as HostedFieldsLocale;
    else if (strict) fail("invalid_hosted_fields_option", 'locale must be "auto", "ru" or "en"');
  }

  if (input.texts !== undefined) {
    if (!isRecord(input.texts)) {
      if (strict) fail("invalid_hosted_fields_option", "texts must be an object");
    } else {
      const texts: HostedFieldsTexts = {};
      const placeholders = sanitizeTextMap(
        input.texts.placeholders,
        INPUTS,
        "texts.placeholders",
        strict,
      );
      const labels = sanitizeTextMap(input.texts.labels, INPUTS, "texts.labels", strict);
      const errors = sanitizeTextMap(
        input.texts.errors,
        HOSTED_FIELD_ISSUE_CODES,
        "texts.errors",
        strict,
      );
      if (placeholders) texts.placeholders = placeholders;
      if (labels) texts.labels = labels;
      if (errors) texts.errors = errors;
      out.texts = texts;
    }
  }

  const layout = sanitizeLayout(input.layout, strict);
  if (layout) out.layout = layout;

  for (const key of ["disabled", "readOnly", "autofocus", "showBrandIcon", "maskCvv", "autoAdvance"] as const) {
    const flag = input[key];
    if (flag === undefined) continue;
    if (typeof flag === "boolean") out[key] = flag;
    else if (strict) fail("invalid_hosted_fields_option", `${key} must be a boolean`);
  }

  const { expiryYearFormat } = input;
  if (expiryYearFormat !== undefined) {
    if (expiryYearFormat === "YY" || expiryYearFormat === "YYYY") {
      out.expiryYearFormat = expiryYearFormat;
    } else if (strict) {
      fail("invalid_hosted_fields_option", 'expiryYearFormat must be "YY" or "YYYY"');
    }
  }

  return out;
};

/** Picks the runtime keys out of a larger options object (Element options). */
export const pickRuntimeOptions = (source: object): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const record = source as Record<string, unknown>;
  for (const key of RUNTIME_OPTION_KEYS) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
};
