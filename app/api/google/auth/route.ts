import { NextResponse } from "next/server";
import { buildAuthUrl, isConfigured, setState } from "@/lib/google";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 }
    );
  }
  const { url, state } = buildAuthUrl();
  await setState(state);
  return NextResponse.redirect(url);
}
