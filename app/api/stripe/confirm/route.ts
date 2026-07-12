import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/billing";

/**
 * Fast path after Checkout: the browser returns here with the session id and we
 * apply the subscription immediately, so the upgrade shows without waiting for
 * the webhook. The webhook remains authoritative for renewals/cancellations.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId) return NextResponse.json({ error: "Missing session id." }, { status: 400 });

  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  // Only let a user confirm their own checkout session.
  if (session.client_reference_id && session.client_reference_id !== userId) {
    return NextResponse.json({ error: "Session does not belong to you." }, { status: 403 });
  }

  const sub = session.subscription;
  if (!sub || typeof sub === "string") {
    return NextResponse.json({ error: "Subscription not ready yet." }, { status: 409 });
  }

  await syncSubscription(userId, sub as Stripe.Subscription, true);
  return NextResponse.json({ ok: true });
}
