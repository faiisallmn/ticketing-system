import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Priority, Role, TicketStatus } from "@/generated/prisma/enums";

const STATUSES: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export type TicketFilters = {
  q?: string;
  status?: string | null;
  priority?: string | null;
  assigneeId?: string | null;
  unassigned?: boolean;
  teamId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  departmentId?: string | null;
  breached?: boolean;
  /** Overdue or due within 24 hours (either deadline, unfinished). */
  atRisk?: boolean;
  from?: Date | null;
  to?: Date | null;
};

export type SearchOutcome = { ids: string[]; total: number };

function cleanStatus(value: string | null | undefined): TicketStatus | null {
  return value && (STATUSES as string[]).includes(value) ? (value as TicketStatus) : null;
}

function cleanPriority(value: string | null | undefined): Priority | null {
  return value && (PRIORITIES as string[]).includes(value) ? (value as Priority) : null;
}

function cleanId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Full-text (title, description, comments) + trigram fallback (typos,
 * partial words) search combined with structured filters. Requesters are
 * always scoped to their own tickets.
 */
export async function searchTicketIds(
  viewer: { id: string; role: Role },
  filters: TicketFilters,
  page: number,
  pageSize: number,
): Promise<SearchOutcome> {
  const q = filters.q?.trim() ?? "";
  const status = cleanStatus(filters.status);
  const priority = cleanPriority(filters.priority);
  const assigneeId = cleanId(filters.assigneeId);
  const teamId = cleanId(filters.teamId);
  const categoryId = cleanId(filters.categoryId);
  const tagId = cleanId(filters.tagId);
  const departmentId = cleanId(filters.departmentId);

  const conditions: Prisma.Sql[] = [];
  if (viewer.role === "REQUESTER") {
    conditions.push(Prisma.sql`t."requesterId" = ${viewer.id}`);
  }
  if (status) conditions.push(Prisma.sql`t.status = ${status}::"TicketStatus"`);
  if (priority) conditions.push(Prisma.sql`t.priority = ${priority}::"Priority"`);
  if (assigneeId) conditions.push(Prisma.sql`t."assigneeId" = ${assigneeId}`);
  if (filters.unassigned) conditions.push(Prisma.sql`t."assigneeId" IS NULL`);
  if (teamId) conditions.push(Prisma.sql`t."teamId" = ${teamId}`);
  if (categoryId) conditions.push(Prisma.sql`t."categoryId" = ${categoryId}`);
  if (departmentId) conditions.push(Prisma.sql`t."departmentId" = ${departmentId}`);
  if (tagId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM ticket_tags tt WHERE tt."ticketId" = t.id AND tt."tagId" = ${tagId})`,
    );
  }
  if (filters.from) conditions.push(Prisma.sql`t."createdAt" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`t."createdAt" <= ${filters.to}`);
  if (filters.breached) {
    conditions.push(
      Prisma.sql`((t."dueResponseAt" < NOW() AND t."firstRespondedAt" IS NULL) OR (t."dueResolutionAt" < NOW() AND t."resolvedAt" IS NULL))`,
    );
  }
  if (filters.atRisk) {
    conditions.push(
      Prisma.sql`((t."dueResponseAt" < NOW() + INTERVAL '24 hours' AND t."firstRespondedAt" IS NULL) OR (t."dueResolutionAt" < NOW() + INTERVAL '24 hours' AND t."resolvedAt" IS NULL))`,
    );
  }

  if (q !== "") {
    // Requesters never match on internal notes — those are hidden from them.
    const commentScope =
      viewer.role === "REQUESTER" ? Prisma.sql`AND c."isInternal" = false` : Prisma.empty;
    conditions.push(Prisma.sql`(
      to_tsvector('english', t.title || ' ' || t.description) @@ plainto_tsquery('english', ${q})
      OR EXISTS (
        SELECT 1 FROM comments c
        WHERE c."ticketId" = t.id
          ${commentScope}
          AND to_tsvector('english', c.body) @@ plainto_tsquery('english', ${q})
      )
      ${
        // Trigram fallback for typos and partial words. word_similarity takes
        // the query first; both sides are lowered because pg_trgm is
        // case-sensitive. Skipped for very short queries (too noisy).
        q.length >= 3
          ? Prisma.sql`OR word_similarity(lower(${q}), lower(t.title)) > 0.5`
          : Prisma.empty
      }
    )`);
  }

  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
  const commentScopeRank =
    viewer.role === "REQUESTER" ? Prisma.sql`AND c."isInternal" = false` : Prisma.empty;
  // NOTE: ORDER BY cannot be a bare constant, so the ranked and unranked
  // orderings are built as separate fragments.
  const ordering =
    q !== ""
      ? Prisma.sql`ORDER BY (
          ts_rank(to_tsvector('english', t.title || ' ' || t.description), plainto_tsquery('english', ${q}))
          + CASE WHEN EXISTS (
              SELECT 1 FROM comments c
              WHERE c."ticketId" = t.id
                ${commentScopeRank}
                AND to_tsvector('english', c.body) @@ plainto_tsquery('english', ${q})
            ) THEN 0.4 ELSE 0 END
          + CASE WHEN length(${q}) >= 3
              THEN word_similarity(lower(${q}), lower(t.title))
              ELSE 0 END
        ) DESC, t."updatedAt" DESC`
      : Prisma.sql`ORDER BY t."updatedAt" DESC`;

  const safePage = Math.max(1, page);
  const limit = Math.min(Math.max(1, pageSize), 100);

  const [rows, counted] = await Promise.all([
    db.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM tickets t
      ${where}
      ${ordering}
      LIMIT ${limit} OFFSET ${(safePage - 1) * limit}
    `,
    db.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS total FROM tickets t
      ${where}
    `,
  ]);

  return { ids: rows.map((row) => row.id), total: counted[0]?.total ?? 0 };
}
