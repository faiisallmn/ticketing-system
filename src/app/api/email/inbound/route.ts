import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { parseAddress, processInboundEmail, type InboundEmail } from "@/lib/email/inbound";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { IncomingFile } from "@/lib/attachments";

type ReceivedAttachmentMeta = {
  id: string;
  filename?: string | null;
  content_type?: string;
};

type ReceivedEventData = {
  email_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  message_id?: string;
  attachments?: ReceivedAttachmentMeta[];
};

async function downloadAttachment(
  resend: Resend,
  emailId: string,
  meta: ReceivedAttachmentMeta,
): Promise<IncomingFile | null> {
  try {
    const response = (await resend.emails.receiving.attachments.get({
      emailId,
      id: meta.id,
    })) as unknown as {
      data?: { download_url?: string; filename?: string; content_type?: string } | null;
      error?: { message?: string } | null;
    };
    const url = response.data?.download_url;
    if (!url) {
      console.warn(`[inbound] no download url for attachment ${meta.id} on ${emailId}`);
      return null;
    }
    const fetched = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!fetched.ok) {
      console.warn(`[inbound] attachment download failed: HTTP ${fetched.status}`);
      return null;
    }
    const bytes = Buffer.from(await fetched.arrayBuffer());
    return {
      filename: meta.filename ?? response.data?.filename ?? `attachment-${meta.id}`,
      mimeType: meta.content_type ?? response.data?.content_type ?? "application/octet-stream",
      size: bytes.byteLength,
      bytes,
    };
  } catch (error) {
    console.warn(`[inbound] attachment download failed for ${meta.id}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(`inbound:${clientIp(request.headers)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limited — Resend will retry." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.resetAfterMs / 1000)) },
      },
    );
  }

  const raw = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  let eventType: string | undefined;
  let data: ReceivedEventData | undefined;

  if (secret) {
    const resend = new Resend(process.env.RESEND_API_KEY?.trim() || "re_no_key_configured");
    try {
      const verified = resend.webhooks.verify({
        payload: raw,
        headers: {
          id: request.headers.get("svix-id") ?? "",
          timestamp: request.headers.get("svix-timestamp") ?? "",
          signature: request.headers.get("svix-signature") ?? "",
        },
        webhookSecret: secret,
      }) as unknown as { type?: string; data?: ReceivedEventData };
      eventType = verified.type;
      data = verified.data;
    } catch {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  } else {
    console.warn(
      "[inbound] RESEND_WEBHOOK_SECRET is not set — accepting unsigned webhook (development only).",
    );
    try {
      const parsed = JSON.parse(raw) as { type?: string; data?: ReceivedEventData };
      eventType = parsed.type;
      data = parsed.data;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
  }

  if (eventType !== "email.received" || !data) {
    return NextResponse.json({ ok: true, ignored: "not-email-received" });
  }

  const emailId = data?.email_id;
  const from = data?.from?.trim().toLowerCase();
  if (!emailId || !from) {
    return NextResponse.json({ error: "Missing email metadata." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[inbound] RESEND_API_KEY is not set — cannot fetch email content.");
    return NextResponse.json({ error: "Inbound mail is not configured." }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const { data: full, error } = await resend.emails.receiving.get(emailId);
  if (error || !full) {
    console.error("[inbound] failed to fetch email content:", error);
    return NextResponse.json({ error: "Failed to fetch email content." }, { status: 502 });
  }

  const files: IncomingFile[] = [];
  for (const meta of full.attachments ?? []) {
    const file = await downloadAttachment(resend, emailId, meta);
    if (file) files.push(file);
  }

  const headerFrom = full.headers?.["from"] ?? full.headers?.["From"];
  const parsed = headerFrom ? parseAddress(headerFrom) : null;

  const recipients = new Set<string>();
  for (const address of [...(full.to ?? []), ...(data.to ?? [])]) {
    const clean = address.trim().toLowerCase();
    if (clean) recipients.add(clean);
  }

  const mail: InboundEmail = {
    emailId,
    messageId: full.message_id ?? data.message_id ?? null,
    from: (full.from || from).trim().toLowerCase(),
    fromName: parsed?.name ?? null,
    to: [...recipients],
    subject: full.subject ?? data.subject ?? null,
    textBody: full.text,
    htmlBody: full.html,
    headers: full.headers,
    attachments: files,
  };

  const result = await processInboundEmail(mail);
  return NextResponse.json({ ok: true, ...result });
}
