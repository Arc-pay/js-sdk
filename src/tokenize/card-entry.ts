import type { Client } from "../core/client";
import { ArcPayError } from "../core/errors";

interface CardEntryTicketResponse {
  ticket: string;
  card_entry_url: string;
  expires_at?: string;
}

const isTicketResponse = (v: unknown): v is CardEntryTicketResponse =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as CardEntryTicketResponse).ticket === "string" &&
  (v as CardEntryTicketResponse).ticket.length > 0 &&
  typeof (v as CardEntryTicketResponse).card_entry_url === "string";

/**
 * Two-step card entry: ask the API for a short-lived signed ticket (no card
 * data in that call), then POST the card straight to the card-entry host the
 * ticket names. A rejected ticket (`ticket_invalid`) is replaced by a fresh one
 * exactly once; the card is never sent to the API host.
 */
export const submitCardToCardEntry = async <T>(
  client: Client,
  ticketPath: string,
  ticketBody: unknown,
  card: unknown,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    const ticket = await client.post<unknown>(ticketPath, ticketBody);
    if (!isTicketResponse(ticket)) {
      throw new ArcPayError({
        type: "api_error",
        code: "invalid_card_entry_ticket",
        message: "Invalid card entry ticket response",
        retryable: false,
      });
    }
    try {
      return await client.postCardEntry<T>(ticket.card_entry_url, ticket.ticket, card);
    } catch (e) {
      if (attempt === 0 && e instanceof ArcPayError && e.code === "ticket_invalid") continue;
      throw e;
    }
  }
};
