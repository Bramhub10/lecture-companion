import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { getEntitlement } from "@/lib/entitlement";

/** Open the Stripe-hosted Customer Portal so students can update/cancel. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const ent = await getEntitlement(userId);
  if (!ent.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: ent.stripeCustomerId,
    return_url: `${origin}/pricing`,
  });

  return NextResponse.json({ url: session.url });
}
