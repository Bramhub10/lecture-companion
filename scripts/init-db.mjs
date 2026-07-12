/**
 * One-off (idempotent): create the `lectures` table + index in Neon Postgres.
 *
 * Usage (from the project root), with DATABASE_URL loaded from .env.local:
 *   node --env-file=.env.local scripts/init-db.mjs
 * or inline:
 *   DATABASE_URL=postgresql://... node scripts/init-db.mjs
 *
 * Safe to re-run: uses CREATE TABLE / INDEX IF NOT EXISTS. Run once per
 * environment (the Neon resource is shared across prod/preview/dev by default).
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (in .env.local or inline) before running.");

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS lectures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    course text,
    analysis jsonb NOT NULL,
    transcript text NOT NULL
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS lectures_user_created
    ON lectures (user_id, created_at DESC)
`;

const [{ count }] = await sql`SELECT count(*)::int AS count FROM lectures`;
console.log(`✓ lectures table ready (rows: ${count})`);
