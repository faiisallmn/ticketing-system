import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;

export function maxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

const ALLOWED_MIME_PREFIXES = ["image/", "text/"];

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/json",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized === "") return false;
  if (ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return ALLOWED_MIME_EXACT.has(normalized);
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned === "" ? "file" : cleaned;
}

/** Stored posix-style, e.g. "uploads/cm123/uuid_screenshot.png". */
export function buildStorageRelativePath(ticketId: string, uniqueName: string): string {
  const safeTicket = ticketId.replace(/[^a-zA-Z0-9_-]/g, "");
  return ["uploads", safeTicket, uniqueName].join("/");
}

export function storageAbsolutePath(relativePath: string): string {
  return path.join(process.cwd(), "storage", ...relativePath.split("/"));
}

export type IncomingFile = {
  filename: string;
  mimeType: string;
  size: number;
  bytes: Buffer;
};

export type StoredFile = IncomingFile & { storagePath: string };

/** Shared validation for web uploads and inbound-email attachments. */
export function validateIncomingFiles(
  files: IncomingFile[],
  limitBytes: number = maxUploadBytes(),
): { ok: true } | { ok: false; error: string } {
  if (files.length === 0) return { ok: false, error: "No files provided." };
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return { ok: false, error: `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.` };
  }
  for (const file of files) {
    if (!file.filename) return { ok: false, error: "A file is missing its name." };
    if (file.size > limitBytes) {
      return {
        ok: false,
        error: `"${file.filename}" exceeds the ${(limitBytes / 1024 / 1024).toFixed(0)} MB limit.`,
      };
    }
    if (!isAllowedMimeType(file.mimeType)) {
      return {
        ok: false,
        error: `"${file.filename}" has an unsupported file type (${file.mimeType || "unknown"}).`,
      };
    }
  }
  return { ok: true };
}

/** Writes files to storage/<ticket>. Throws on failure; writes nothing partial. */
export async function storeAttachmentFiles(
  ticketId: string,
  files: IncomingFile[],
): Promise<StoredFile[]> {
  const stored: StoredFile[] = [];
  try {
    for (const file of files) {
      const uniqueName = `${randomUUID()}_${sanitizeFilename(file.filename)}`;
      const storagePath = buildStorageRelativePath(ticketId, uniqueName);
      const absolutePath = storageAbsolutePath(storagePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.bytes);
      stored.push({ ...file, storagePath });
    }
    return stored;
  } catch (error) {
    await Promise.allSettled(
      stored.map((file) => unlink(storageAbsolutePath(file.storagePath)).catch(() => undefined)),
    );
    throw error;
  }
}
