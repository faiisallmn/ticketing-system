import type { NextRequest } from "next/server";
import { authenticateApiKey, hasScope, type ApiActor, type ApiScope } from "./auth";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "./respond";

export const API_RATE_LIMIT = 100;
const API_RATE_WINDOW_SECONDS = 60;

type GuardOk = { actor: ApiActor; rateHeaders: HeadersInit };
type GuardOut = GuardOk | { response: ReturnType<typeof apiError> };

/** API-key auth + scope check + per-key rate limit for v1 routes. */
export async function guardApi(request: NextRequest, scope: ApiScope): Promise<GuardOut> {
  const auth = await authenticateApiKey(request);
  if ("error" in auth) {
    return { response: apiError(auth.error.status, "unauthorized", auth.error.message) };
  }
  if (!hasScope(auth.actor, scope)) {
    return {
      response: apiError(403, "forbidden", `This API key lacks the ${scope} scope.`),
    };
  }

  const limit = await rateLimit(`api:${auth.actor.keyId}`, API_RATE_LIMIT, API_RATE_WINDOW_SECONDS);
  const rateHeaders: HeadersInit = {
    "X-RateLimit-Limit": String(API_RATE_LIMIT),
    "X-RateLimit-Remaining": String(limit.remaining),
  };
  if (!limit.ok) {
    return {
      response: apiError(429, "rate_limited", "Too many requests — slow down.", {
        ...rateHeaders,
        "Retry-After": String(Math.ceil(limit.resetAfterMs / 1000)),
      }),
    };
  }
  return { actor: auth.actor, rateHeaders };
}
