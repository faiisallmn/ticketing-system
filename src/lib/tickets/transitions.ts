import type { TicketStatus } from "@/generated/prisma/enums";

/**
 * The only legal way to move a ticket between statuses.
 *
 * Two invariants are enforced:
 * - a ticket must pass through RESOLVED before it can be CLOSED;
 * - a CLOSED ticket can only be reopened via REOPENED.
 */
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"],
  IN_PROGRESS: ["WAITING_ON_CUSTOMER", "RESOLVED", "OPEN"],
  WAITING_ON_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "OPEN"],
  RESOLVED: ["CLOSED", "REOPENED", "IN_PROGRESS"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_ON_CUSTOMER", "OPEN"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
