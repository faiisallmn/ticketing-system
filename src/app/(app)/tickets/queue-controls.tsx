"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Queue keyboard navigation: j/k moves the selection, Enter opens it.
 * Ignored while typing. The selected row is marked through data attributes
 * so server-rendered rows need no client state.
 */
export function QueueControls({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setIndex((prev) => {
          if (ids.length === 0) return null;
          const base = prev ?? (event.key === "j" ? -1 : ids.length);
          const next =
            event.key === "j" ? Math.min(ids.length - 1, base + 1) : Math.max(0, base - 1);
          document
            .querySelector(`[data-ticket-row="${ids[next]}"]`)
            ?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (event.key === "Enter" && index !== null && ids[index]) {
        router.push(`/tickets/${ids[index]}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, index, router]);

  useEffect(() => {
    document.querySelectorAll("[data-ticket-row][data-active]").forEach((el) => {
      el.removeAttribute("data-active");
    });
    if (index !== null && ids[index]) {
      document.querySelector(`[data-ticket-row="${ids[index]}"]`)?.setAttribute("data-active", "true");
    }
  }, [index, ids]);

  useEffect(() => {
    document.querySelectorAll("[data-queue-table]").forEach((el) => {
      if (compact) el.setAttribute("data-density", "compact");
      else el.removeAttribute("data-density");
    });
  }, [compact]);

  if (ids.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-faint">
        <kbd className="rounded border border-line bg-surface px-1 font-sans">j</kbd>/
        <kbd className="rounded border border-line bg-surface px-1 font-sans">k</kbd> to move,{" "}
        <kbd className="rounded border border-line bg-surface px-1 font-sans">Enter</kbd> to open
      </p>
      <button
        type="button"
        onClick={() => setCompact(!compact)}
        aria-pressed={compact}
        title="Toggle compact rows"
        className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:bg-sunken hover:text-ink"
      >
        {compact ? "Comfortable" : "Compact"}
      </button>
    </div>
  );
}
