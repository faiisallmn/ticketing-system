type Named = { id: string; name: string } | null;

export type SerializableTicket = {
  publicId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  severity: string;
  source: string;
  category: Named;
  tags: string[];
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string } | null;
  team: Named;
  department: Named;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenedAt: Date | null;
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  csatScore: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type TicketRow = {
  publicId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  severity: string;
  source: string;
  category: { id: string; name: string } | null;
  tags: Array<{ tag: { name: string } }>;
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenedAt: Date | null;
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  csatScore: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeTicket(ticket: TicketRow): SerializableTicket {
  return {
    publicId: ticket.publicId,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    severity: ticket.severity,
    source: ticket.source,
    category: ticket.category ? { id: ticket.category.id, name: ticket.category.name } : null,
    tags: ticket.tags.map(({ tag }) => tag.name),
    requester: {
      id: ticket.requester.id,
      name: ticket.requester.name,
      email: ticket.requester.email,
    },
    assignee: ticket.assignee ? { id: ticket.assignee.id, name: ticket.assignee.name } : null,
    team: ticket.team ? { id: ticket.team.id, name: ticket.team.name } : null,
    department: ticket.department
      ? { id: ticket.department.id, name: ticket.department.name }
      : null,
    firstRespondedAt: ticket.firstRespondedAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    reopenedAt: ticket.reopenedAt,
    dueResponseAt: ticket.dueResponseAt,
    dueResolutionAt: ticket.dueResolutionAt,
    csatScore: ticket.csatScore,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export const TICKET_INCLUDE = {
  category: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { name: true } } } },
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} as const;
