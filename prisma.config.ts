import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` doesn't need a database connection, so read the URLs
// leniently instead of using `env()` (which throws when a variable is unset).
// This keeps builds working in environments without DATABASE_URL; commands
// that do connect (migrate, seed, studio) still fail clearly without one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
