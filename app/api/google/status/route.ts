import { NextResponse } from "next/server";
import { isConfigured, isConnected } from "@/lib/google";

export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    connected: await isConnected(),
  });
}
