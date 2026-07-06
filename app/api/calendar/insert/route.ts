import { NextRequest, NextResponse } from "next/server";
import { insertEvents } from "@/lib/google";

export async function POST(req: NextRequest) {
  try {
    const { events, timeZone } = await req.json();
    if (!Array.isArray(events)) {
      return NextResponse.json({ error: "No events provided." }, { status: 400 });
    }
    const results = await insertEvents(events, timeZone || "UTC");
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add events.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
