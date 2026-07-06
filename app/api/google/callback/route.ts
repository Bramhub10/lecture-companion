import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, readState } from "@/lib/google";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return NextResponse.redirect(`${origin}/?gcal=error`);
  if (!code) return NextResponse.redirect(`${origin}/?gcal=error`);

  // CSRF check: the state we handed out must match what came back.
  if (state !== (await readState())) {
    return NextResponse.redirect(`${origin}/?gcal=badstate`);
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(`${origin}/?gcal=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/?gcal=error`);
  }
}
