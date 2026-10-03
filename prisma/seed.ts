import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const departments = {
  support: { name: "Customer Support", slug: "customer-support" },
  finance: { name: "Finance", slug: "finance" },
} as const;

const teams = {
  tier1: { name: "Tier 1", slug: "tier-1", department: "support" },
  tier2: { name: "Tier 2", slug: "tier-2", department: "support" },
  billing: { name: "Billing", slug: "billing", department: "finance" },
} as const;

const people = [
  {
    name: "Alice Admin",
    email: "admin@support.local",
    password: "Admin1234!",
    role: Role.ADMIN,
    jobTitle: "Head of Support",
    department: "support",
    team: null,
  },
  {
    name: "Morgan Manager",
    email: "manager@support.local",
    password: "Manager1234!",
    role: Role.MANAGER,
    jobTitle: "Support Manager",
    department: "support",
    team: "tier1",
  },
  {
    name: "Sam Agent",
    email: "agent1@support.local",
    password: "Agent1234!",
    role: Role.AGENT,
    jobTitle: "Support Agent",
    department: "support",
    team: "tier1",
  },
  {
    name: "Jordan Agent",
    email: "agent2@support.local",
    password: "Agent1234!",
    role: Role.AGENT,
    jobTitle: "Escalation Agent",
    department: "support",
    team: "tier2",
  },
  {
    name: "Riley Agent",
    email: "agent3@support.local",
    password: "Agent1234!",
    role: Role.AGENT,
    jobTitle: "Billing Specialist",
    department: "finance",
    team: "billing",
  },
  {
    name: "Casey Requester",
    email: "requester1@support.local",
    password: "Requester1234!",
    role: Role.REQUESTER,
    jobTitle: "Sales Operations",
    department: "support",
    team: null,
  },
  {
    name: "Taylor Requester",
    email: "requester2@support.local",
    password: "Requester1234!",
    role: Role.REQUESTER,
    jobTitle: "Finance Analyst",
    department: "finance",
    team: null,
  },
] as const;

async function main() {
  const departmentIds: Record<string, string> = {};
  for (const [key, department] of Object.entries(departments)) {
    const record = await db.department.upsert({
      where: { slug: department.slug },
      update: { name: department.name },
      create: department,
    });
    departmentIds[key] = record.id;
  }

  const teamIds: Record<string, string> = {};
  for (const [key, team] of Object.entries(teams)) {
    const record = await db.team.upsert({
      where: { slug: team.slug },
      update: { name: team.name },
      create: {
        name: team.name,
        slug: team.slug,
        departmentId: departmentIds[team.department],
      },
    });
    teamIds[key] = record.id;
  }

  for (const person of people) {
    await db.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        role: person.role,
        jobTitle: person.jobTitle,
        departmentId: departmentIds[person.department],
        teamId: person.team ? teamIds[person.team] : null,
        isActive: true,
      },
      create: {
        name: person.name,
        email: person.email,
        passwordHash: await bcrypt.hash(person.password, 12),
        role: person.role,
        jobTitle: person.jobTitle,
        departmentId: departmentIds[person.department],
        teamId: person.team ? teamIds[person.team] : null,
      },
    });
  }

  console.log("Seed complete.");
  console.log("");
  console.log("Sign-in accounts (all passwords listed per account):");
  for (const person of people) {
    console.log(`  ${person.role.padEnd(10)} ${person.email.padEnd(30)} ${person.password}`);
  }

  await seedDemoContent();
  await seedAutomationContent();
  await seedKnowledgeBase();
}

const demoCategories = [
  { name: "Bug", slug: "bug", color: "#ef4444", department: "support" },
  { name: "Feature Request", slug: "feature-request", color: "#3b82f6", department: "support" },
  { name: "Billing", slug: "billing-cat", color: "#f59e0b", department: "finance" },
  { name: "Access Request", slug: "access-request", color: "#8b5cf6", department: "support" },
  { name: "Question", slug: "question", color: "#10b981", department: null },
] as const;

const demoTags = [
  { name: "vip", slug: "vip", color: "#ef4444" },
  { name: "outage", slug: "outage", color: "#dc2626" },
  { name: "follow-up", slug: "follow-up", color: "#3b82f6" },
] as const;

async function seedDemoContent() {
  const existing = await db.ticket.count();
  if (existing > 0) {
    console.log("Demo tickets already exist — skipping demo content.");
    return;
  }

  const departmentIds: Record<string, string> = {};
  for (const department of await db.department.findMany()) {
    departmentIds[department.slug] = department.id;
  }
  const teamIds: Record<string, string> = {};
  for (const team of await db.team.findMany()) {
    teamIds[team.slug] = team.id;
  }
  const userIds: Record<string, string> = {};
  const userNames: Record<string, string> = {};
  for (const user of await db.user.findMany({ select: { id: true, email: true, name: true } })) {
    userIds[user.email] = user.id;
    userNames[user.email] = user.name;
  }

  const categoryIds: Record<string, string> = {};
  for (const category of demoCategories) {
    const record = await db.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: {
        name: category.name,
        slug: category.slug,
        color: category.color,
        departmentId: category.department ? departmentIds[category.department] : null,
      },
    });
    categoryIds[category.slug] = record.id;
  }

  for (const tag of demoTags) {
    await db.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { name: tag.name, slug: tag.slug, color: tag.color },
    });
  }

  const daysAgo = (days: number, hours = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(date.getHours() - hours);
    return date;
  };

  type DemoTicket = {
    title: string;
    description: string;
    status: "OPEN" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED" | "REOPENED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    category: string | null;
    team: string | null;
    assignee: string | null;
    requester: string;
    department: string | null;
    createdAt: Date;
    comments: Array<{ author: string; body: string; isInternal: boolean; createdAt: Date }>;
  };

  const demoTickets: DemoTicket[] = [
    {
      title: "Cannot log in after password reset",
      description:
        "Hi team,\n\nI reset my password this morning and now I cannot log in at all. The login page just refreshes without an error message. Tried in Chrome and Edge, cleared cookies already.\n\nThis is blocking my work — please help!",
      status: "OPEN" as const,
      priority: "HIGH" as const,
      severity: "HIGH" as const,
      category: "bug",
      team: "tier-1",
      assignee: null,
      requester: "requester1@support.local",
      department: "support",
      createdAt: daysAgo(0, 3),
      comments: [
        {
          author: "agent1@support.local",
          body: "Checked the auth logs — I can see failed attempts for this account. Likely a stale session cookie; will ask the requester to try an incognito window first.",
          isInternal: true,
          createdAt: daysAgo(0, 2),
        },
      ],
    },
    {
      title: "Invoice INV-2041 shows the wrong VAT amount",
      description:
        "Our invoice INV-2041 for last month lists 20% VAT but our company is registered in a region where 0% should apply for this service. Can finance review and reissue?",
      status: "IN_PROGRESS" as const,
      priority: "MEDIUM" as const,
      severity: "MEDIUM" as const,
      category: "billing-cat",
      team: "billing",
      assignee: "agent3@support.local",
      requester: "requester2@support.local",
      department: "finance",
      createdAt: daysAgo(2),
      comments: [
        {
          author: "agent3@support.local",
          body: "Thanks for flagging this — I have asked finance to verify the tax treatment and reissue the invoice. I will update you as soon as the corrected copy is ready.",
          isInternal: false,
          createdAt: daysAgo(1, 20),
        },
        {
          author: "agent3@support.local",
          body: "Finance confirmed the rate was wrong for this account type. Waiting on the reissued PDF.",
          isInternal: true,
          createdAt: daysAgo(1, 5),
        },
      ],
    },
    {
      title: "VPN access for new starter in Sales",
      description:
        "Please provision VPN access for our new starter (Priya Nair, Sales, starts Monday). She needs access to the CRM subnet and the shared drive.",
      status: "RESOLVED" as const,
      priority: "MEDIUM" as const,
      severity: "LOW" as const,
      category: "access-request",
      team: "tier-1",
      assignee: "agent1@support.local",
      requester: "requester1@support.local",
      department: "support",
      createdAt: daysAgo(5),
      comments: [
        {
          author: "agent1@support.local",
          body: "Access provisioned for both the CRM subnet and the shared drive. Priya can sign in with her SSO account — let me know if she hits any issues on day one.",
          isInternal: false,
          createdAt: daysAgo(4),
        },
      ],
    },
    {
      title: "Email signature not updating in Outlook",
      description:
        "I updated my signature in the portal two days ago but Outlook still shows the old one. Restarted Outlook twice already.",
      status: "CLOSED" as const,
      priority: "LOW" as const,
      severity: "LOW" as const,
      category: "question",
      team: "tier-1",
      assignee: "agent1@support.local",
      requester: "requester1@support.local",
      department: "support",
      createdAt: daysAgo(9),
      comments: [
        {
          author: "agent1@support.local",
          body: "This is usually the local Outlook cache — I pushed a fresh policy sync from our side. Could you restart Outlook once more and confirm?",
          isInternal: false,
          createdAt: daysAgo(8),
        },
        {
          author: "requester1@support.local",
          body: "Works now, thanks!",
          isInternal: false,
          createdAt: daysAgo(7, 22),
        },
      ],
    },
  ];

  for (const demo of demoTickets) {
    await db.$transaction(async (tx) => {
      const [{ n }] =
        await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('ticket_public_id_seq') AS n`;
      const ticket = await tx.ticket.create({
        data: {
          publicId: `TK-${n.toString().padStart(6, "0")}`,
          title: demo.title,
          description: demo.description,
          status: demo.status,
          priority: demo.priority,
          severity: demo.severity,
          source: "WEB",
          requesterId: userIds[demo.requester]!,
          assigneeId: demo.assignee ? userIds[demo.assignee]! : null,
          teamId: demo.team ? teamIds[demo.team]! : null,
          departmentId: demo.department ? departmentIds[demo.department]! : null,
          categoryId: demo.category ? categoryIds[demo.category]! : null,
          firstRespondedAt:
            demo.status === "OPEN" ? null : demo.createdAt,
          resolvedAt:
            demo.status === "RESOLVED" || demo.status === "CLOSED"
              ? daysAgo(demo.status === "CLOSED" ? 7 : 4)
              : null,
          closedAt: demo.status === "CLOSED" ? daysAgo(7) : null,
          createdAt: demo.createdAt,
          updatedAt: demo.createdAt,
        },
      });

      await logSeedEvent(tx, ticket.id, userIds[demo.requester]!, "CREATED", demo.createdAt);
      if (demo.assignee) {
        await logSeedEvent(tx, ticket.id, userIds[demo.assignee]!, "ASSIGNED", demo.createdAt, {
          field: "assignee",
          newValue: userNames[demo.assignee] ?? demo.assignee,
        });
      }
      if (demo.status !== "OPEN") {
        await logSeedEvent(tx, ticket.id, userIds[demo.assignee ?? demo.requester]!, "STATUS_CHANGED", demo.createdAt, {
          field: "status",
          oldValue: "OPEN",
          newValue: demo.status,
        });
      }

      for (const comment of demo.comments) {
        await tx.comment.create({
          data: {
            ticketId: ticket.id,
            authorId: userIds[comment.author]!,
            body: comment.body,
            isInternal: comment.isInternal,
            createdAt: comment.createdAt,
          },
        });
        await logSeedEvent(tx, ticket.id, userIds[comment.author]!, "COMMENT_ADDED", comment.createdAt, {
          metadata: { isInternal: comment.isInternal },
        });
      }

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date(Math.max(...demo.comments.map((c) => c.createdAt.getTime()), demo.createdAt.getTime())) },
      });
    });
  }

  console.log("Demo tickets, categories and tags seeded.");
}

async function seedAutomationContent() {
  const admin = await db.user.findUnique({ where: { email: "admin@support.local" } });
  const tier1 = await db.team.findUnique({ where: { slug: "tier-1" } });
  const tier2 = await db.team.findUnique({ where: { slug: "tier-2" } });
  const billingTeam = await db.team.findUnique({ where: { slug: "billing" } });
  const billingCategory = await db.category.findUnique({ where: { slug: "billing-cat" } });
  if (!admin || !tier1 || !tier2 || !billingTeam || !billingCategory) {
    console.log("Phase 1 seed data missing — skipping automation seed.");
    return;
  }

  let calendar = await db.businessHours.findFirst({ where: { name: "Standard Support Hours" } });
  if (!calendar) {
    await db.businessHours.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    calendar = await db.businessHours.create({
      data: {
        name: "Standard Support Hours",
        timezone: "Asia/Jakarta",
        workdays: [1, 2, 3, 4, 5],
        workStart: "09:00",
        workEnd: "17:00",
        isDefault: true,
        isActive: true,
      },
    });
  }

  for (const holiday of [
    { name: "New Year", date: "2026-01-01", isRecurring: true },
    { name: "Independence Day", date: "2026-08-17", isRecurring: true },
    { name: "Christmas Day", date: "2026-12-25", isRecurring: true },
  ]) {
    const existing = await db.holiday.findFirst({ where: { name: holiday.name } });
    if (!existing) {
      await db.holiday.create({
        data: {
          name: holiday.name,
          date: new Date(`${holiday.date}T00:00:00Z`),
          isRecurring: holiday.isRecurring,
        },
      });
    }
  }

  const policies: Array<{
    name: string;
    categoryId: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    isDefault: boolean;
  }> = [
    { name: "Default", categoryId: null, priority: null, firstResponseMinutes: 240, resolutionMinutes: 960, isDefault: true },
    { name: "Critical incidents", categoryId: null, priority: "CRITICAL", firstResponseMinutes: 30, resolutionMinutes: 240, isDefault: false },
    { name: "High priority", categoryId: null, priority: "HIGH", firstResponseMinutes: 60, resolutionMinutes: 480, isDefault: false },
    { name: "Low priority", categoryId: null, priority: "LOW", firstResponseMinutes: 480, resolutionMinutes: 1920, isDefault: false },
  ];
  for (const policy of policies) {
    const existing = await db.sLAPolicy.findFirst({ where: { name: policy.name } });
    if (!existing) {
      if (policy.isDefault) {
        await db.sLAPolicy.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      await db.sLAPolicy.create({
        data: { ...policy, businessHoursId: calendar.id, isActive: true },
      });
    }
  }

  const assignRules: Array<{
    name: string;
    strategy: "ROUND_ROBIN" | "CATEGORY" | "WORKLOAD";
    categoryId: string | null;
    teamId: string | null;
    targetTeamId: string | null;
    targetUserId: string | null;
    position: number;
  }> = [
    { name: "Billing to specialists", strategy: "CATEGORY", categoryId: billingCategory.id, teamId: null, targetTeamId: billingTeam.id, targetUserId: null, position: 0 },
    { name: "Tier 1 round robin", strategy: "ROUND_ROBIN", categoryId: null, teamId: tier1.id, targetTeamId: null, targetUserId: null, position: 1 },
    { name: "Balance Tier 2 load", strategy: "WORKLOAD", categoryId: null, teamId: tier2.id, targetTeamId: null, targetUserId: null, position: 2 },
  ];
  for (const rule of assignRules) {
    const existing = await db.autoAssignmentRule.findFirst({ where: { name: rule.name } });
    if (!existing) {
      await db.autoAssignmentRule.create({ data: { ...rule, isActive: true } });
    }
  }

  const escalationRules: Array<{
    name: string;
    trigger: "SLA_BREACH_IMMINENT" | "SLA_BREACH" | "WAITING_TOO_LONG";
    thresholdMinutes: number;
    action: "RAISE_PRIORITY" | "REASSIGN_TEAM" | "NOTIFY_MANAGER";
    targetTeamId: string | null;
    cooldownMinutes: number;
    position: number;
  }> = [
    { name: "Response deadline approaching", trigger: "SLA_BREACH_IMMINENT", thresholdMinutes: 60, action: "NOTIFY_MANAGER", targetTeamId: null, cooldownMinutes: 120, position: 0 },
    { name: "Breached deadline", trigger: "SLA_BREACH", thresholdMinutes: 0, action: "RAISE_PRIORITY", targetTeamId: null, cooldownMinutes: 240, position: 1 },
    { name: "Waiting too long", trigger: "WAITING_TOO_LONG", thresholdMinutes: 240, action: "REASSIGN_TEAM", targetTeamId: tier2.id, cooldownMinutes: 240, position: 2 },
  ];
  for (const rule of escalationRules) {
    const existing = await db.escalationRule.findFirst({ where: { name: rule.name } });
    if (!existing) {
      await db.escalationRule.create({ data: { ...rule, isActive: true } });
    }
  }

  const canned: Array<{ title: string; body: string; scope: "GLOBAL" | "TEAM"; teamId: string | null }> = [
    {
      title: "Thanks — we're on it",
      body: "Thanks for reaching out! We've picked up your ticket and an agent is looking into it. We'll update you here as soon as there's progress.",
      scope: "GLOBAL",
      teamId: null,
    },
    {
      title: "Need more information",
      body: "Could you share a few more details so we can help faster?\n\n1. What you were trying to do\n2. What happened instead (the exact error text helps a lot)\n3. A screenshot, if possible\n\nThanks!",
      scope: "GLOBAL",
      teamId: null,
    },
    {
      title: "Resolved — please confirm",
      body: "This looks resolved from our side. Could you confirm everything works for you? If we don't hear back within 3 working days, we'll close the ticket.",
      scope: "GLOBAL",
      teamId: null,
    },
    {
      title: "Escalated to Tier 2",
      body: "I've escalated this to our Tier 2 specialists — they'll take it from here and keep you updated on this ticket.",
      scope: "TEAM",
      teamId: tier1.id,
    },
  ];
  for (const reply of canned) {
    const existing = await db.cannedResponse.findFirst({ where: { title: reply.title } });
    if (!existing) {
      await db.cannedResponse.create({ data: { ...reply, createdById: admin.id, isActive: true } });
    }
  }

  console.log("Automation seed complete (calendar, holidays, policies, rules, canned replies).");
}

async function seedKnowledgeBase() {
  const admin = await db.user.findUnique({ where: { email: "admin@support.local" } });
  if (!admin) {
    console.log("Admin user missing — skipping knowledge base seed.");
    return;
  }
  const question = await db.category.findUnique({ where: { slug: "question" } });
  const billing = await db.category.findUnique({ where: { slug: "billing-cat" } });
  const access = await db.category.findUnique({ where: { slug: "access-request" } });

  const articles = [
    {
      title: "How to reset your password",
      slug: "reset-your-password",
      excerpt: "Locked out? Reset your password in under two minutes.",
      categoryId: question?.id ?? null,
      content: [
        "# How to reset your password",
        "",
        "If you cannot sign in, follow these steps:",
        "",
        "1. Open the sign-in page and click **Forgot password**.",
        "2. Enter your work email address.",
        "3. Open the reset link within **15 minutes** — it expires quickly.",
        "4. Choose a password with at least 12 characters.",
        "",
        "## Still stuck?",
        "",
        "- Check your spam folder for the reset email.",
        "- Make sure Caps Lock is off.",
        "- If the link expired, request a fresh one instead of reusing the old mail.",
        "",
        "If none of that works, file a ticket and choose the **Bug** category so we can investigate your account directly.",
      ].join("\n"),
    },
    {
      title: "Requesting VPN access for new starters",
      slug: "vpn-access-new-starters",
      excerpt: "What to include so access is ready on day one.",
      categoryId: access?.id ?? null,
      content: [
        "# Requesting VPN access for new starters",
        "",
        "File an **Access Request** ticket at least **two working days** before the start date and include:",
        "",
        "| Field | Example |",
        "| --- | --- |",
        "| Full name | Priya Nair |",
        "| Team | Sales |",
        "| Needed subnets | CRM, shared drive |",
        "| Start date | Monday 12 May |",
        "",
        "Access is tied to SSO, so the starter must activate their account first. Same-day requests are best effort only.",
      ].join("\n"),
    },
    {
      title: "Understanding your invoice",
      slug: "understanding-your-invoice",
      excerpt: "VAT, line items and how to dispute a charge.",
      categoryId: billing?.id ?? null,
      content: [
        "# Understanding your invoice",
        "",
        "Every invoice lists:",
        "",
        "- The service period and plan.",
        "- VAT treatment for your registered region.",
        "- A total in your billing currency.",
        "",
        "## Wrong VAT rate?",
        "",
        "If the VAT looks wrong, reply to this article's guidance by filing a **Billing** ticket with the invoice number (e.g. `INV-2041`). Finance usually reissues within **3 working days**.",
      ].join("\n"),
    },
  ];

  for (const article of articles) {
    const existing = await db.article.findUnique({ where: { slug: article.slug } });
    if (!existing) {
      await db.article.create({
        data: { ...article, status: "PUBLISHED", authorId: admin.id, publishedAt: new Date() },
      });
    }
  }

  console.log("Knowledge base seed complete.");
}

async function logSeedEvent(
  tx: Prisma.TransactionClient,
  ticketId: string,
  actorId: string,
  type: "CREATED" | "ASSIGNED" | "STATUS_CHANGED" | "COMMENT_ADDED",
  createdAt: Date,
  extra?: { field?: string; oldValue?: string; newValue?: string; metadata?: { isInternal: boolean } },
) {
  await tx.ticketEvent.create({
    data: {
      ticketId,
      actorId,
      type,
      field: extra?.field,
      oldValue: extra?.oldValue,
      newValue: extra?.newValue,
      metadata: extra?.metadata ?? undefined,
      createdAt,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
