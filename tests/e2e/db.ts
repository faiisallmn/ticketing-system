import "dotenv/config";
import { Client } from "pg";

export const E2E_PREFIX = "E2E-PW-";

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

export async function scalar<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<Record<string, T>>(sql, params);
  const first = rows[0];
  if (!first) return null;
  return Object.values(first)[0] ?? null;
}

/** Remove everything this suite created (tickets cascade to the rest). */
export async function cleanupE2E() {
  await query(`DELETE FROM tickets WHERE title LIKE 'E2E-PW-%'`);
  await query(`DELETE FROM articles WHERE title LIKE 'E2E-PW-%'`);
  await query(`DELETE FROM saved_filters WHERE name LIKE 'E2E-PW-%'`);
  await query(`DELETE FROM api_keys WHERE name LIKE 'E2E-PW-%'`);
  // Test users never file, own, or comment — plain delete is safe.
  await query(`DELETE FROM users WHERE email LIKE 'e2e-pw-%'`);
}
