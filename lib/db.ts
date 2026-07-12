import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Shared Neon Postgres client. The HTTP driver is safe under Fluid Compute —
 * there is no long-lived connection pool to exhaust across function instances.
 * Constructed lazily (like `getStripe`) so importing this never throws at
 * build time when `DATABASE_URL` is absent; interpolated values in the `sql`
 * tagged template are always sent as parameters, never string-concatenated.
 */
let client: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    client = neon(url);
  }
  return client;
}
