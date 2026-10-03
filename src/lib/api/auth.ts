import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const API_SCOPES = ["tickets:read", "tickets:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string } {
  const raw = `sk_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 11) };
}

export type ApiActor = {
  keyId: string;
  scopes: string[];
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MANAGER" | "AGENT" | "REQUESTER";
    departmentId: string | null;
    teamId: string | null;
  };
};

export function hasScope(actor: ApiActor, scope: ApiScope): boolean {
  return actor.scopes.includes(scope);
}

export async function authenticateApiKey(
  request: NextRequest,
): Promise<{ actor: ApiActor } | { error: { status: number; message: string } }> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (!match) {
    return { error: { status: 401, message: "Missing or malformed Authorization header. Use: Bearer <api-key>." } };
  }

  const key = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(match[1]!) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          departmentId: true,
          teamId: true,
          isActive: true,
        },
      },
    },
  });

  if (
    !key ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= new Date()) ||
    !key.user.isActive
  ) {
    return { error: { status: 401, message: "Invalid API key." } };
  }

  await db.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    actor: {
      keyId: key.id,
      scopes: key.scopes,
      user: {
        id: key.user.id,
        name: key.user.name,
        email: key.user.email,
        role: key.user.role,
        departmentId: key.user.departmentId,
        teamId: key.user.teamId,
      },
    },
  };
}
