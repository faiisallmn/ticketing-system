"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatFileSize } from "@/lib/format";

export function AttachmentUpload({
  ticketId,
  maxBytes,
}: {
  ticketId: string;
  maxBytes: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);
    try {
      const data = new FormData();
      for (const file of files) {
        data.append("files", file);
      }
      const response = await fetch(`/api/tickets/${ticketId}/attachments`, {
        method: "POST",
        body: data,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Upload failed. Try again with smaller files.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Upload failed. Try again with smaller files.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label
        htmlFor={`files-${ticketId}`}
        className="block text-[13px] font-medium"
      >
        Add files (up to {formatFileSize(maxBytes)} each)
      </label>
      <input
        ref={inputRef}
        id={`files-${ticketId}`}
        type="file"
        name="files"
        multiple
        className="block w-full text-[13px] text-muted file:mr-3 file:rounded file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-sunken"
      />
      <button
        type="submit"
        disabled={uploading}
        className="rounded border border-line bg-surface px-3 py-1.5 text-[13px] font-medium transition hover:bg-sunken disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
