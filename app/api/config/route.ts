import { NextResponse } from "next/server";

/**
 * Reports whether the server itself has keys configured. When it does, visitors
 * can use the app straight away (running on the owner's keys) without opening
 * Settings. Users may still supply their own keys to override.
 */
export function GET() {
  return NextResponse.json({
    hasServerGateway: Boolean(process.env.AI_GATEWAY_API_KEY),
    hasServerDeepgram: Boolean(process.env.DEEPGRAM_API_KEY),
  });
}
