import type {
  AssignmentStrategy,
  EscalationAction,
  EscalationTrigger,
  NotificationType,
  Priority,
  Role,
  Severity,
  TicketStatus,
  WebhookEventType,
} from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  AGENT: "Agent",
  REQUESTER: "Requester",
};

export const ROLE_DOT_CLASSES: Record<Role, string> = {
  ADMIN: "bg-accent",
  MANAGER: "bg-st-progress",
  AGENT: "bg-st-resolved",
  REQUESTER: "bg-faint",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CUSTOMER: "Waiting on Customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

/** Dot color per status. Resolved/closed render dimmed (see badges.tsx). */
export const STATUS_DOT_CLASSES: Record<TicketStatus, string> = {
  OPEN: "bg-st-open",
  IN_PROGRESS: "bg-st-progress",
  WAITING_ON_CUSTOMER: "bg-st-waiting",
  RESOLVED: "bg-st-resolved",
  CLOSED: "bg-st-resolved",
  REOPENED: "bg-accent",
};

const DIMMED_STATUSES: TicketStatus[] = ["RESOLVED", "CLOSED"];

export function isDimmedStatus(status: TicketStatus): boolean {
  return DIMMED_STATUSES.includes(status);
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** Filled bars out of three for the priority mark. Color only for High/Critical. */
export const PRIORITY_BARS: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 2,
  CRITICAL: 3,
};

export const PRIORITY_TEXT_CLASSES: Record<Priority, string> = {
  LOW: "font-normal text-muted",
  MEDIUM: "font-medium text-ink",
  HIGH: "font-semibold text-warn",
  CRITICAL: "font-semibold text-danger",
};

export const PRIORITY_BAR_CLASSES: Record<Priority, string> = {
  LOW: "bg-faint",
  MEDIUM: "bg-muted",
  HIGH: "bg-warn",
  CRITICAL: "bg-danger",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const STRATEGY_LABELS: Record<AssignmentStrategy, string> = {
  ROUND_ROBIN: "Round robin",
  CATEGORY: "Category routing",
  WORKLOAD: "Lightest load",
};

export const TRIGGER_LABELS: Record<EscalationTrigger, string> = {
  SLA_BREACH_IMMINENT: "SLA about to breach",
  SLA_BREACH: "SLA breached",
  WAITING_TOO_LONG: "Waiting on customer too long",
};

export const ESCALATION_ACTION_LABELS: Record<EscalationAction, string> = {
  RAISE_PRIORITY: "Raise priority",
  REASSIGN_TEAM: "Move to another team",
  NOTIFY_MANAGER: "Notify manager",
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  TICKET_ASSIGNED: "Assigned",
  TICKET_CREATED: "Ticket created",
  STATUS_CHANGED: "Status changed",
  COMMENT_ADDED: "New reply",
  SLA_WARNING: "Deadline approaching",
  SLA_BREACHED: "SLA breached",
  ESCALATED: "Escalated",
  CSAT_REQUEST: "Feedback requested",
};

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  TICKET_CREATED: "Ticket created",
  TICKET_UPDATED: "Ticket updated",
  COMMENT_ADDED: "Reply added",
  SLA_BREACHED: "SLA breached",
  ESCALATED: "Escalated",
};
