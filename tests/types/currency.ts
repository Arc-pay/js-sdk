import type { Currency, KnownCurrency } from "../../src/server/browser";

// Every ISO 4217 code is accepted, not only the ones with autocomplete.
const rouble: Currency = "RUB";
const yen: Currency = "JPY";
const dinar: Currency = "KWD";
const rupiah: Currency = "IDR";
const known: KnownCurrency = "EUR";
const fromKnown: Currency = known;

// @ts-expect-error A currency code is a string, never a number.
const numeric: Currency = 392;

void [rouble, yen, dinar, rupiah, fromKnown, numeric];
