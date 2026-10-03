import type { Role } from "@/generated/prisma/enums";

/**
 * Ticket visibility scoping.
 *
 * Staff (ADMIN / MANAGER / AGENT) can open every ticket; requesters can only
 * open tickets they submitted themselves. Team/department scoping for staff
 * arrives with workload routing in Phase 2.
 */
export function canAccessTicket(
  viewer: { id: string; role: Role },
  ticketRequesterId: string,
): boolean {
  if (viewer.role === "REQUESTER") {
    return viewer.id === ticketRequesterId;
  }
  return true;
}

/** Assignees must be staff — requesters can never own a ticket. */
export function isAssignableRole(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "AGENT";
}
