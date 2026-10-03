import type { TicketEventType } from "@/generated/prisma/enums";

export const EVENT_LABELS: Record<TicketEventType, string> = {
  CREATED: "created the ticket",
  STATUS_CHANGED: "changed the status",
  PRIORITY_CHANGED: "changed the priority",
  SEVERITY_CHANGED: "changed the severity",
  ASSIGNED: "assigned the ticket",
  UNASSIGNED: "unassigned the ticket",
  TEAM_CHANGED: "changed the team",
  DEPARTMENT_CHANGED: "changed the department",
  CATEGORY_CHANGED: "changed the category",
  TAGS_CHANGED: "changed the tags",
  DETAILS_CHANGED: "edited the ticket",
  COMMENT_ADDED: "commented",
  COMMENT_EDITED: "edited a comment",
  ATTACHMENT_ADDED: "added attachments",
  SLA_BREACHED: "breached an SLA deadline",
  ESCALATED: "escalated the ticket",
};

/** Timeline shows state changes; comments and attachments have their own sections. */
export function isTimelineEvent(type: TicketEventType): boolean {
  return type !== "COMMENT_ADDED" && type !== "ATTACHMENT_ADDED";
}
