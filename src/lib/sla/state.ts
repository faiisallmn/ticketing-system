export type SlaVisualState = "off" | "done" | "breached" | "due-soon" | "ok";

const DUE_SOON_CAP_MS = 4 * 3600 * 1000;

export function deadlineState(args: {
  dueAt: Date | string | null;
  /** Moment the clock started (ticket creation, or last recompute). */
  from: Date | string;
  /** Set when the underlying work is done (first response / resolution). */
  doneAt: Date | string | null | undefined;
  now?: Date;
}): SlaVisualState {
  if (!args.dueAt) return "off";
  if (args.doneAt) return "done";

  const now = args.now ?? new Date();
  const dueMs = new Date(args.dueAt).getTime();
  const remaining = dueMs - now.getTime();
  if (remaining <= 0) return "breached";

  const total = dueMs - new Date(args.from).getTime();
  const warnAt = Math.min(Math.max(total * 0.25, 0), DUE_SOON_CAP_MS);
  if (remaining <= warnAt) return "due-soon";
  return "ok";
}

export type DeadlineReading = {
  state: SlaVisualState;
  /** Design copy: "2h 10m left" / "Breached 35m ago" / "Paused". */
  text: string;
  /** Fraction of the allowance consumed, 0..1 (1 when breached or done). */
  consumed: number;
};

/**
 * Everything a clock needs: state, text and fill fraction. `paused` renders
 * the hatched bar — used for the resolution clock while waiting on customer.
 */
export function readDeadline(args: {
  dueAt: Date | string | null;
  from: Date | string;
  doneAt: Date | string | null | undefined;
  paused?: boolean;
  now?: Date;
}): DeadlineReading {
  const state = deadlineState(args);
  const now = args.now ?? new Date();

  if (state === "off") return { state, text: "No target", consumed: 0 };
  if (state === "done") return { state, text: "Done", consumed: 1 };

  const dueMs = new Date(args.dueAt!).getTime();
  const totalMs = Math.max(1, dueMs - new Date(args.from).getTime());

  if (state === "breached") {
    return {
      state,
      text: `Breached ${formatDuration(now.getTime() - dueMs)} ago`,
      consumed: 1,
    };
  }
  const remainingMs = dueMs - now.getTime();
  return {
    state,
    text: `${formatDuration(remainingMs)} left`,
    consumed: Math.min(1, Math.max(0, 1 - remainingMs / totalMs)),
  };
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / 60000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 48) {
    const rest = totalMinutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}
