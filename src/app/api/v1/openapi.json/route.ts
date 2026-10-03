import { NextResponse } from "next/server";

/**
 * Hand-written OpenAPI 3.1 document for the v1 REST API. Kept next to the
 * routes it describes — update both together.
 */
const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Support Desk API",
    version: "1.0.0",
    description:
      "Programmatic access to tickets. Keys act with their owner's role permissions; requesters only ever see their own tickets and never internal notes.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key created under Administration → API keys.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "not_found" },
              message: { type: "string" },
            },
          },
        },
      },
      Ticket: {
        type: "object",
        properties: {
          publicId: { type: "string", example: "TK-000123" },
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED", "REOPENED"],
          },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          source: { type: "string", enum: ["WEB", "EMAIL", "API"] },
          category: {
            type: ["object", "null"],
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
          tags: { type: "array", items: { type: "string" } },
          requester: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
            },
          },
          assignee: {
            type: ["object", "null"],
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
          team: {
            type: ["object", "null"],
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
          department: {
            type: ["object", "null"],
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
          firstRespondedAt: { type: ["string", "null"], format: "date-time" },
          resolvedAt: { type: ["string", "null"], format: "date-time" },
          closedAt: { type: ["string", "null"], format: "date-time" },
          reopenedAt: { type: ["string", "null"], format: "date-time" },
          dueResponseAt: { type: ["string", "null"], format: "date-time" },
          dueResolutionAt: { type: ["string", "null"], format: "date-time" },
          csatScore: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Comment: {
        type: "object",
        properties: {
          id: { type: "string" },
          body: { type: "string" },
          isInternal: { type: "boolean" },
          author: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/tickets": {
      get: {
        summary: "List tickets",
        description:
          "Full-text search (typos tolerated) plus filters. Requesters only see their own tickets.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "assignee_id", in: "query", schema: { type: "string" } },
          { name: "unassigned", in: "query", schema: { type: "string", enum: ["1"] } },
          { name: "team_id", in: "query", schema: { type: "string" } },
          { name: "category_id", in: "query", schema: { type: "string" } },
          { name: "tag_id", in: "query", schema: { type: "string" } },
          { name: "department_id", in: "query", schema: { type: "string" } },
          { name: "breached", in: "query", schema: { type: "string", enum: ["1"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "Paginated tickets",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Ticket" } },
                    meta: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        per_page: { type: "integer" },
                        total: { type: "integer" },
                        total_pages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      post: {
        summary: "Create a ticket",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { type: "string", minLength: 3, maxLength: 200 },
                  description: { type: "string", minLength: 10, maxLength: 20000 },
                  priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                  severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                  categoryId: { type: ["string", "null"] },
                  tagIds: { type: "array", items: { type: "string" } },
                  teamId: { type: ["string", "null"] },
                  departmentId: { type: ["string", "null"] },
                  assigneeId: {
                    type: ["string", "null"],
                    description: "Staff key owners only.",
                  },
                  requesterId: {
                    type: ["string", "null"],
                    description: "Staff key owners only; defaults to the key owner.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created ticket",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/Ticket" } },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/tickets/{publicId}": {
      get: {
        summary: "Get one ticket (with its replies)",
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Ticket with comments",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/Ticket" },
                        {
                          type: "object",
                          properties: {
                            comments: {
                              type: "array",
                              items: { $ref: "#/components/schemas/Comment" },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "404": {
            description: "Not found (includes tickets outside your scope)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      patch: {
        summary: "Update a ticket",
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                minProperties: 1,
                properties: {
                  status: {
                    type: "string",
                    enum: [
                      "OPEN",
                      "IN_PROGRESS",
                      "WAITING_ON_CUSTOMER",
                      "RESOLVED",
                      "CLOSED",
                      "REOPENED",
                    ],
                    description: "Lifecycle rules apply (e.g. RESOLVED before CLOSED).",
                  },
                  priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                  severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                  categoryId: { type: ["string", "null"] },
                  assigneeId: { type: ["string", "null"] },
                  teamId: { type: ["string", "null"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated ticket",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/Ticket" } },
                },
              },
            },
          },
        },
      },
    },
    "/tickets/{publicId}/comments": {
      get: {
        summary: "List replies",
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Replies (internal notes hidden from requester keys)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Add a reply",
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: {
                  body: { type: "string", minLength: 1, maxLength: 20000 },
                  isInternal: {
                    type: "boolean",
                    default: false,
                    description: "Staff keys with internal-note permission only.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created reply",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/Comment" } },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(SPEC);
}
