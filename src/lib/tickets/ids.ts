import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Next human-readable ticket id (TK-000001, …) from the shared sequence. */
export async function nextPublicId(
  client: Prisma.TransactionClient | PrismaClient,
): Promise<string> {
  const [{ n }] =
    await client.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('ticket_public_id_seq') AS n`;
  return `TK-${n.toString().padStart(6, "0")}`;
}
