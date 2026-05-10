import { ArcPayError } from "../core/errors";
import { luhnCheck } from "./luhn";
import { detectScheme } from "./scheme";

export interface TokenizeRequestInput {
  pan: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
  cardholderName?: string;
}

const fail = (code: string, message: string, param?: string): never => {
  throw new ArcPayError({ type: "validation_error", code, message, param, retryable: false });
};

const validatePan = (pan: string): void => {
  if (!/^\d+$/.test(pan)) fail("invalid_card_number", "PAN must contain only digits", "pan");
  if (pan.length < 13 || pan.length > 19)
    fail("invalid_card_number", "PAN must be 13–19 digits", "pan");
  if (!luhnCheck(pan)) fail("invalid_card_number", "Card number failed Luhn check", "pan");
};

const validateCvv = (cvv: string, scheme: ReturnType<typeof detectScheme>): void => {
  if (!/^\d+$/.test(cvv)) fail("invalid_cvv", "CVV must be digits only", "cvv");
  const expected = scheme === "amex" ? 4 : 3;
  if (cvv.length !== expected)
    fail("invalid_cvv", `CVV must be ${expected} digits for this card`, "cvv");
};

const validateExpiry = (month: string, year: string): void => {
  if (!/^\d{2}$/.test(month))
    fail("invalid_expiry", "Expiry month must be 2 digits (01-12)", "expiryMonth");
  if (!/^\d{4}$/.test(year)) fail("invalid_expiry", "Expiry year must be 4 digits", "expiryYear");
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12) fail("invalid_expiry", "Expiry month must be 1–12", "expiryMonth");
  const now = new Date();
  const currentY = now.getUTCFullYear();
  const currentM = now.getUTCMonth() + 1;
  if (y < currentY || (y === currentY && m < currentM))
    fail("card_expired", "Card has expired", "expiryYear");
  if (y > currentY + 20)
    fail("invalid_expiry", "Expiry year is too far in the future (>20 years)", "expiryYear");
};

export const validateTokenizeRequest = (req: TokenizeRequestInput): void => {
  validatePan(req.pan);
  const scheme = detectScheme(req.pan);
  validateCvv(req.cvv, scheme);
  validateExpiry(req.expiryMonth, req.expiryYear);
  if (req.cardholderName !== undefined && req.cardholderName.length > 64)
    fail("invalid_cardholder_name", "Cardholder name max 64 chars", "cardholderName");
};
