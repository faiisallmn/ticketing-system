import { unlink } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { canAccessTicket } from "@/lib/tickets/access";
import { logTicketEvent } from "@/lib/tickets/audit";
import {
  storageAbsolutePath,
  storeAttachmentFiles,
  validateIncomingFiles,
  type IncomingFile,
} from "@/lib/attachments";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!can(user.role, "attachment:upload")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id: ticketId } = await params;
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !canAccessTicket(user, ticket.requesterId)) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const entries = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const incoming: IncomingFile[] = await Promise.all(
    entries.map(async (file) => ({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      bytes: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const validation = validateIncomingFiles(incoming);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let stored;
  try {
    stored = await storeAttachmentFiles(ticket.id, incoming);
  } catch {
    return NextResponse.json({ error: "Failed to store uploaded files." }, { status: 500 });
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const rows = await Promise.all(
        stored.map((file) =>
          tx.attachment.create({
            data: {
              ticketId: ticket.id,
              uploaderId: user.id,
              filename: file.filename,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              size: file.size,
            },
            select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
          }),
        ),
      );
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "ATTACHMENT_ADDED",
        metadata: { count: rows.length, filenames: rows.map((row) => row.filename) },
      });
      return rows;
    });

    return NextResponse.json({ attachments: created }, { status: 201 });
  } catch {
    // Don't leave orphaned files behind when the database write fails.
    await Promise.allSettled(
      stored.map((file) => unlink(storageAbsolutePath(file.storagePath)).catch(() => undefined)),
    );
    return NextResponse.json({ error: "Failed to save attachments." }, { status: 500 });
  }
}
