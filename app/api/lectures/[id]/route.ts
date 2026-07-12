import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

/**
 * Delete one of the signed-in user's lectures. The `user_id` guard in the
 * WHERE clause is the security boundary — a user can only delete their own
 * rows, never another user's, even with a valid id.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const { id } = await params;

  const sql = getSql();
  const deleted = (await sql`
    DELETE FROM lectures
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `) as { id: string }[];

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
