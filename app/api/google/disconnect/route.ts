import { NextResponse } from "next/server";
import { disconnect } from "@/lib/google";

export async function POST() {
  await disconnect();
  return NextResponse.json({ ok: true });
}
