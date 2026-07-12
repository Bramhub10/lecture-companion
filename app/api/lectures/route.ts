import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import type { LectureAnalysis } from "@/lib/schema";

/**
 * Per-user lecture store (server-side, replaces the old localStorage history).
 * Rows are always scoped to the signed-in Clerk user, so a cleared browser or
 * a new device never loses notes and one user can never read another's.
 *
 * The client shape (`SavedLecture`) is { id, savedAt (epoch ms), analysis,
 * transcript }; `title`/`course` are also stored as columns for cheap future
 * listing but are otherwise redundant with fields inside `analysis`.
 */

const MAX = 200; // generous ceiling on a single list response

type Row = {
  id: string;
  created_at: string;
  analysis: LectureAnalysis;
  transcript: string;
};

function toSaved(r: Row) {
  return {
    id: r.id,
    savedAt: new Date(r.created_at).getTime(),
    analysis: r.analysis,
    transcript: r.transcript,
  };
}

/** List the signed-in user's lectures, newest first. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const sql = getSql();
  const rows = (await sql`
    SELECT id, created_at, analysis, transcript
    FROM lectures
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${MAX}
  `) as Row[];

  return NextResponse.json({ lectures: rows.map(toSaved) });
}

/** Save a lecture for the signed-in user; returns the created row. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: { analysis?: LectureAnalysis; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { analysis, transcript } = body;
  if (
    !analysis ||
    typeof analysis !== "object" ||
    typeof analysis.title !== "string" ||
    typeof transcript !== "string"
  ) {
    return NextResponse.json({ error: "Missing analysis or transcript." }, { status: 400 });
  }

  const sql = getSql();
  const [row] = (await sql`
    INSERT INTO lectures (user_id, title, course, analysis, transcript)
    VALUES (${userId}, ${analysis.title}, ${analysis.course ?? null},
            ${JSON.stringify(analysis)}::jsonb, ${transcript})
    RETURNING id, created_at, analysis, transcript
  `) as Row[];

  return NextResponse.json({ lecture: toSaved(row) }, { status: 201 });
}
