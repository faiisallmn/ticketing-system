import type { Role } from "@/generated/prisma/enums";

export type Permission =
  | "ticket:create"
  | "ticket:read:own"
  | "ticket:read:all"
  | "ticket:update"
  | "ticket:assign"
  | "ticket:delete"
  | "ticket:close"
  | "ticket:reopen"
  | "comment:create:public"
  | "comment:create:internal"
  | "comment:read:internal"
  | "attachment:upload"
  | "category:manage"
  | "tag:manage"
  | "team:manage"
  | "user:manage"
  | "sla:manage"
  | "automation:manage"
  | "canned:manage"
  | "report:view"
  | "audit:view"
  | "kb:read"
  | "kb:manage"
  | "api:manage"
  | "webhook:manage";

const ADMIN_PERMISSIONS: Permission[] = Object.values({
  ticket_create: "ticket:create",
  ticket_read_own: "ticket:read:own",
  ticket_read_all: "ticket:read:all",
  ticket_update: "ticket:update",
  ticket_assign: "ticket:assign",
  ticket_delete: "ticket:delete",
  ticket_close: "ticket:close",
  ticket_reopen: "ticket:reopen",
  comment_create_public: "comment:create:public",
  comment_create_internal: "comment:create:internal",
  comment_read_internal: "comment:read:internal",
  attachment_upload: "attachment:upload",
  category_manage: "category:manage",
  tag_manage: "tag:manage",
  team_manage: "team:manage",
  user_manage: "user:manage",
  sla_manage: "sla:manage",
  automation_manage: "automation:manage",
  canned_manage: "canned:manage",
  report_view: "report:view",
  audit_view: "audit:view",
  kb_read: "kb:read",
  kb_manage: "kb:manage",
  api_manage: "api:manage",
  webhook_manage: "webhook:manage",
} satisfies Record<string, Permission>);

const AGENT_BASE: Permission[] = [
  "ticket:create",
  "ticket:read:own",
  "ticket:read:all",
  "ticket:update",
  "ticket:assign",
  "ticket:close",
  "ticket:reopen",
  "comment:create:public",
  "comment:create:internal",
  "comment:read:internal",
  "attachment:upload",
  "canned:manage",
  "kb:read",
];

export const PERMISSIONS_BY_ROLE: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ADMIN_PERMISSIONS),
  MANAGER: new Set<Permission>([
    ...AGENT_BASE,
    "ticket:delete",
    "category:manage",
    "tag:manage",
    "team:manage",
    "sla:manage",
    "automation:manage",
    "report:view",
    "audit:view",
    "kb:manage",
    "webhook:manage",
  ]),
  AGENT: new Set<Permission>(AGENT_BASE),
  REQUESTER: new Set<Permission>([
    "ticket:create",
    "ticket:read:own",
    "comment:create:public",
    "attachment:upload",
    "kb:read",
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role]?.has(permission) ?? false;
}
