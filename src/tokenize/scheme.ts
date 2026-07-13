export type CardScheme =
  "visa" | "mastercard" | "amex" | "discover" | "mir" | "jcb" | "unionpay" | "unknown";

export const detectScheme = (pan: string): CardScheme => {
  if (/^4/.test(pan)) return "visa";
  if (/^220[0-4]/.test(pan)) return "mir";
  if (/^(5[1-5]|2[2-7])/.test(pan)) return "mastercard";
  if (/^3[47]/.test(pan)) return "amex";
  if (/^(6011|65|64[4-9])/.test(pan)) return "discover";
  if (/^35(2[8-9]|[3-8])/.test(pan)) return "jcb";
  if (/^62/.test(pan)) return "unionpay";
  return "unknown";
};
