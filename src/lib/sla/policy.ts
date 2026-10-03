/**
 * Picks the SLA policy for a ticket.
 *
 * A policy matches when every scope it sets (category, priority) equals the
 * ticket's value; an unset scope matches everything. Precedence:
 *
 * 1. category + priority match
 * 2. category-only match
 * 3. priority-only match
 * 4. catch-all custom policy (no scope, not flagged default)
 * 5. flagged default policy
 *
 * Ties break by oldest creation time so the outcome is deterministic.
 */
export type PolicyLike = {
  id: string;
  categoryId: string | null;
  priority: string | null;
  isDefault: boolean;
  createdAt: Date;
};

export type TicketScopeLike = {
  categoryId: string | null;
  priority: string | null;
};

function tier(policy: PolicyLike): number {
  const score = (policy.categoryId ? 2 : 0) + (policy.priority ? 1 : 0);
  if (score === 3) return 1;
  if (score === 2) return 2;
  if (score === 1) return 3;
  if (!policy.isDefault) return 4;
  return 5;
}

export function matchPolicy<T extends PolicyLike>(
  policies: T[],
  ticket: TicketScopeLike,
): T | null {
  const matching = policies.filter(
    (policy) =>
      (policy.categoryId === null || policy.categoryId === ticket.categoryId) &&
      (policy.priority === null || policy.priority === ticket.priority),
  );
  if (matching.length === 0) return null;

  let best = matching[0]!;
  for (const candidate of matching.slice(1)) {
    const bestTier = tier(best);
    const candidateTier = tier(candidate);
    if (
      candidateTier < bestTier ||
      (candidateTier === bestTier && candidate.createdAt < best.createdAt)
    ) {
      best = candidate;
    }
  }
  return best;
}
