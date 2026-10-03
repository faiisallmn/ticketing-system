import { Resend } from "resend";

let client: Resend | null = null;

export function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!client) {
    const baseUrl = process.env.RESEND_BASE_URL?.trim();
    client = baseUrl ? new Resend(key, { baseUrl }) : new Resend(key);
  }
  return client;
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "Support Desk <support@example.com>";
}

export function appUrl(): string {
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

/**
 * Reply-To address that routes answers back to the ticket thread, e.g.
 * ticket+TK-000123@inbound.example.com. Null when inbound mail is not
 * configured (INBOUND_DOMAIN), in which case no Reply-To is set.
 */
export function inboundReplyAddress(publicId: string): string | null {
  const domain = process.env.INBOUND_DOMAIN?.trim();
  if (!domain) return null;
  return `ticket+${publicId}@${domain}`;
}

/** Extract the public ticket id from a reply-to address or subject tag. */
export function extractPublicId(text: string | null | undefined): string | null {
  if (!text) return null;
  const addressMatch = /ticket\+(TK-\d{1,10})@/i.exec(text);
  if (addressMatch) return addressMatch[1]!.toUpperCase();
  const subjectMatch = /\[(TK-\d{1,10})\]/i.exec(text);
  if (subjectMatch) return subjectMatch[1]!.toUpperCase();
  return null;
}
