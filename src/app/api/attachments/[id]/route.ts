import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/tickets/access";
import { sanitizeFilename, storageAbsolutePath } from "@/lib/attachments";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await db.attachment.findUnique({
    where: { id },
    include: { ticket: { select: { requesterId: true } } },
  });
  if (!attachment || !canAccessTicket(user, attachment.ticket.requesterId)) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  let body: Buffer;
  try {
    body = await readFile(storageAbsolutePath(attachment.storagePath));
  } catch {
    return NextResponse.json({ error: "File is missing from storage." }, { status: 404 });
  }

  const safeName = sanitizeFilename(attachment.filename);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(body.byteLength),
      // Always download — never render inline — so uploaded HTML/SVG can't
      // execute in the application's origin.
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
