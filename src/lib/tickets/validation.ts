import { z } from "zod";

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const statuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;

/** Select dropdowns submit "" when nothing is chosen — normalize to null. */
const optionalId = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  });

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  description: z.string().trim().min(10, "Please describe the issue in more detail.").max(20000),
  priority: z.enum(priorities).default("MEDIUM"),
  severity: z.enum(severities).default("MEDIUM"),
  categoryId: optionalId,
  departmentId: optionalId,
  teamId: optionalId,
  assigneeId: optionalId,
  requesterId: optionalId,
  tagIds: z.array(z.string().min(1)).default([]),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(statuses),
});

export const updateTicketPrioritySchema = z.object({
  priority: z.enum(priorities),
});

export const updateTicketSeveritySchema = z.object({
  severity: z.enum(severities),
});

export const assignTicketSchema = z.object({
  assigneeId: optionalId,
  teamId: optionalId,
});

export const updateTicketDetailsSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  description: z.string().trim().min(10, "Please describe the issue in more detail.").max(20000),
  categoryId: optionalId,
  departmentId: optionalId,
  tagIds: z.array(z.string().min(1)).default([]),
});

export const addCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(20000),
  isInternal: z.boolean().default(false),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  description: z.string().trim().max(500).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #3b82f6.")
    .default("#71717a"),
  departmentId: optionalId,
});

export const createTagSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #3b82f6.")
    .default("#71717a"),
});

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

export const createCannedSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120),
  body: z.string().trim().min(1, "Body cannot be empty.").max(20000),
  shortcut: z.string().max(40).nullish().transform(emptyToNull),
  scope: z.enum(["GLOBAL", "TEAM"]).default("GLOBAL"),
  teamId: optionalId,
  categoryId: optionalId,
});

export const updateCannedSchema = createCannedSchema.extend({
  isActive: z.boolean().default(true),
});

const nullablePriority = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  })
  .refine(
    (value): value is "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null =>
      value === null || (priorities as readonly string[]).includes(value),
    { message: "Invalid priority." },
  );

const positiveMinutes = z.coerce.number().int().min(1).max(60 * 24 * 30);

export const createBusinessHoursSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  timezone: z.string().trim().min(1, "Timezone is required.").max(80),
  workdays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  workStart: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:MM."),
  workEnd: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:MM."),
  isDefault: z.boolean().default(false),
});

export const createHolidaySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date."),
  isRecurring: z.boolean().default(false),
});

export const createSlaPolicySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  categoryId: optionalId,
  priority: nullablePriority,
  firstResponseMinutes: positiveMinutes,
  resolutionMinutes: positiveMinutes,
  businessHoursId: z.string().min(1, "Pick a calendar."),
  isDefault: z.boolean().default(false),
});

const strategies = ["ROUND_ROBIN", "CATEGORY", "WORKLOAD"] as const;
const triggers = ["SLA_BREACH_IMMINENT", "SLA_BREACH", "WAITING_TOO_LONG"] as const;
const escalationActions = ["RAISE_PRIORITY", "REASSIGN_TEAM", "NOTIFY_MANAGER"] as const;

export const createAssignRuleSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  strategy: z.enum(strategies),
  categoryId: optionalId,
  teamId: optionalId,
  targetTeamId: optionalId,
  targetUserId: optionalId,
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export const createEscalationRuleSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  trigger: z.enum(triggers),
  thresholdMinutes: positiveMinutes,
  categoryId: optionalId,
  teamId: optionalId,
  priority: nullablePriority,
  action: z.enum(escalationActions),
  targetTeamId: optionalId,
  newPriority: nullablePriority,
  cooldownMinutes: z.coerce.number().int().min(5).max(60 * 24 * 7).default(60),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

const webhookEvents = [
  "TICKET_CREATED",
  "TICKET_UPDATED",
  "COMMENT_ADDED",
  "SLA_BREACHED",
  "ESCALATED",
] as const;

const webhookFormats = ["JSON", "SLACK"] as const;

export const createWebhookSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  url: z
    .string()
    .trim()
    .min(1, "URL is required.")
    .refine(
      (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Must be a valid http(s) URL." },
    ),
  events: z.array(z.enum(webhookEvents)).min(1, "Pick at least one event."),
  format: z.enum(webhookFormats).default("JSON"),
  secret: z
    .string()
    .max(200)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    }),
});

const articleStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const createArticleSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
  slug: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === null || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), {
      message: "Slug may only contain lowercase letters, numbers and dashes.",
    }),
  excerpt: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    }),
  content: z.string().trim().min(10, "Write at least a few sentences.").max(100000),
  categoryId: optionalId,
  status: z.enum(articleStatuses).default("DRAFT"),
});

export const submitCsatSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .max(1000)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    }),
});

const roles = ["ADMIN", "MANAGER", "AGENT", "REQUESTER"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  role: z.enum(roles).default("REQUESTER"),
  jobTitle: optionalText(100),
  departmentId: optionalId,
  teamId: optionalId,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.email({ error: "Enter a valid email address." }),
  role: z.enum(roles),
  jobTitle: optionalText(100),
  departmentId: optionalId,
  teamId: optionalId,
  isActive: z.boolean().default(true),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  jobTitle: optionalText(100),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").max(128),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current one.",
    path: ["newPassword"],
  });
