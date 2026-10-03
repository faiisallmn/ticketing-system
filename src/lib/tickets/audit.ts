import type { Prisma, PrismaClient, TicketEventType } from "@/generated/prisma/client";

export type TicketEventInput = {
  ticketId: string;
  actorId?: string | null;
  type: TicketEventType;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Append-only audit writer. Accepts both the global client and an interactive
 * transaction client so callers can keep mutations and their audit rows atomic.
 */
export async function logTicketEvent(
  client: Prisma.TransactionClient | PrismaClient,
  input: TicketEventInput,
): Promise<void> {
  await client.ticketEvent.create({
    data: {
      ticketId: input.ticketId,
      actorId: input.actorId ?? null,
      type: input.type,
      field: input.field,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      metadata: input.metadata,
    },
  });
}
