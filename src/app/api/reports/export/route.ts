import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(","), ...rows.map((row) => row.map(cell).join(","))];
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\n")}`;
}

function parseDays(raw: string | null): number {
  const days = Number.parseInt(raw ?? "", 10);
  return [7, 30, 90, 365].includes(days) ? days : 30;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!can(user.role, "report:view")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type") === "csat" ? "csat" : "tickets";
  const days = parseDays(params.get("days"));
  const departmentId = params.get("departmentId") || undefined;
  const teamId = params.get("teamId") || undefined;

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const scope = {
    ...(departmentId ? { departmentId } : {}),
    ...(teamId ? { teamId } : {}),
  };

  let csv: string;
  if (type === "csat") {
    const rows = await db.ticket.findMany({
      where: { ...scope, resolvedAt: { gte: from, lte: to }, csatScore: { not: null } },
      orderBy: { resolvedAt: "desc" },
      take: 5000,
      include: {
        requester: { select: { name: true, email: true } },
        assignee: { select: { name: true } },
      },
    });
    csv = toCsv(
      ["publicId", "title", "requester", "requesterEmail", "assignee", "resolvedAt", "csatScore", "csatComment"],
      rows.map((ticket) => [
        ticket.publicId,
        ticket.title,
        ticket.requester.name,
        ticket.requester.email,
        ticket.assignee?.name,
        ticket.resolvedAt,
        ticket.csatScore,
        ticket.csatComment,
      ]),
    );
  } else {
    const rows = await db.ticket.findMany({
      where: { ...scope, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        requester: { select: { name: true, email: true } },
        assignee: { select: { name: true } },
        team: { select: { name: true } },
        department: { select: { name: true } },
        category: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });
    csv = toCsv(
      [
        "publicId", "title", "status", "priority", "severity", "category", "tags",
        "requester", "requesterEmail", "assignee", "team", "department", "source",
        "createdAt", "firstRespondedAt", "resolvedAt", "closedAt", "reopenedAt",
        "dueResponseAt", "dueResolutionAt", "responseBreachNotifiedAt",
        "resolutionBreachNotifiedAt", "escalationLevel", "csatScore", "csatComment",
      ],
      rows.map((ticket) => [
        ticket.publicId,
        ticket.title,
        ticket.status,
        ticket.priority,
        ticket.severity,
        ticket.category?.name,
        ticket.tags.map(({ tag }) => tag.name).join("|"),
        ticket.requester.name,
        ticket.requester.email,
        ticket.assignee?.name,
        ticket.team?.name,
        ticket.department?.name,
        ticket.source,
        ticket.createdAt,
        ticket.firstRespondedAt,
        ticket.resolvedAt,
        ticket.closedAt,
        ticket.reopenedAt,
        ticket.dueResponseAt,
        ticket.dueResolutionAt,
        ticket.responseBreachNotifiedAt,
        ticket.resolutionBreachNotifiedAt,
        ticket.escalationLevel,
        ticket.csatScore,
        ticket.csatComment,
      ]),
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-last-${days}-days.csv"`,
    },
  });
}
