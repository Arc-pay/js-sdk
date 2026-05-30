import type { Client } from "../core/client";
import { type TokenizeRequestInput, validateTokenizeRequest } from "./validate";

export interface TokenizeResult {
  cardTokenId: string;
  cardMask: string;
  cardScheme: string;
  cardBin: string;
  expiresIn: number;
  expiresAt: string;
}

interface TokenizeRequest extends TokenizeRequestInput {
  paymentId: string;
}

interface TokenizeResponseBody {
  card_token_id: string;
  card_mask: string;
  card_scheme: string;
  card_bin: string;
  expires_in: number;
  expires_at: string;
}

export const tokenize = async (client: Client, req: TokenizeRequest): Promise<TokenizeResult> => {
  validateTokenizeRequest(req);
  const body: Record<string, string> = {
    pan: req.pan,
    cvv: req.cvv,
    expiry_month: req.expiryMonth,
    expiry_year: req.expiryYear,
  };

  const res = await client.post<TokenizeResponseBody>(
    `/v1/payments/${encodeURIComponent(req.paymentId)}/tokenize`,
    body,
  );
  return {
    cardTokenId: res.card_token_id,
    cardMask: res.card_mask,
    cardScheme: res.card_scheme,
    cardBin: res.card_bin,
    expiresIn: res.expires_in,
    expiresAt: res.expires_at,
  };
};
