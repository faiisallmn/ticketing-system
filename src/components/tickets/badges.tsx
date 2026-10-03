import type { Priority, Role, Severity, TicketStatus } from "@/generated/prisma/enums";
import {
  PRIORITY_BAR_CLASSES,
  PRIORITY_BARS,
  PRIORITY_LABELS,
  PRIORITY_TEXT_CLASSES,
  ROLE_DOT_CLASSES,
  ROLE_LABELS,
  SEVERITY_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_LABELS,
  isDimmedStatus,
} from "@/lib/labels";
import type { SlaVisualState } from "@/lib/sla/state";

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

/** Status is a filled dot plus text — never color alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const dimmed = isDimmedStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px] ${
        dimmed ? "text-muted" : "text-ink"
      }`}
    >
      <Dot className={STATUS_DOT_CLASSES[status]} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px] text-ink">
      <Dot className={ROLE_DOT_CLASSES[role]} />
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Priority reads through weight and bars; color only for High and Critical. */
export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <LevelMark
      label={PRIORITY_LABELS[priority]}
      filled={PRIORITY_BARS[priority]}
      textClass={PRIORITY_TEXT_CLASSES[priority]}
      barClass={PRIORITY_BAR_CLASSES[priority]}
    />
  );
}

export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <LevelMark
      label={SEVERITY_LABELS[severity]}
      filled={PRIORITY_BARS[severity]}
      textClass={PRIORITY_TEXT_CLASSES[severity]}
      barClass={PRIORITY_BAR_CLASSES[severity]}
    />
  );
}

function LevelMark({
  label,
  filled,
  textClass,
  barClass,
}: {
  label: string;
  filled: number;
  textClass: string;
  barClass: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-[18px] ${textClass}`}
    >
      <span aria-hidden className="flex items-end gap-[2px]">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`w-[3px] ${index < filled ? barClass : "bg-line"}`}
            style={{ height: `${6 + index * 3}px` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export type ClockTone = "neutral" | "warn" | "danger" | "done";

const CLOCK_BAR_CLASSES: Record<ClockTone, string> = {
  neutral: "bg-faint",
  done: "bg-st-resolved",
  danger: "bg-danger",
  warn: "bg-warn",
};

export function clockTone(state: SlaVisualState): ClockTone {
  if (state === "breached") return "danger";
  if (state === "due-soon") return "warn";
  if (state === "done") return "done";
  return "neutral";
}

/**
 * The signature element: a thin consumed-time segment plus plain tabular text.
 * `consumed` is 0..1 (1 = fully consumed or breached). Paused renders hatched.
 */
export function SlaClock({
  tone,
  text,
  consumed,
  title,
  paused,
  wide,
}: {
  tone: ClockTone;
  text: string;
  /** Fraction of the allowance consumed, 0..1. */
  consumed: number;
  title?: string;
  paused?: boolean;
  wide?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, consumed * 100));
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <span aria-hidden className={`h-1 ${wide ? "w-full" : "w-24"} overflow-hidden bg-line`}>
        <span
          className={`block h-full ${paused ? "hatch w-full" : CLOCK_BAR_CLASSES[tone]}`}
          style={paused ? undefined : { width: `${pct}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-muted">{text}</span>
    </span>
  );
}
