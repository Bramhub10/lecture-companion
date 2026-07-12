import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { planPriceId, type PlanId } from "@/lib/plans";
import { getEntitlement, updateEntitlement } from "@/lib/entitlement";

/** Create a Stripe-hosted Checkout Session for the chosen plan. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: PlanId };
  const priceId = plan ? planPriceId(plan) : undefined;
  if (!plan || plan === "free" || !priceId) {
    return NextResponse.json({ error: "Unknown or unavailable plan." }, { status: 400 });
  }

  const stripe = getStripe();
  const ent = await getEntitlement(userId);

  // Reuse the user's Stripe customer, or create one linked back to Clerk.
  let customerId = ent.stripeCustomerId;
  if (!customerId) {
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;
    const customer = await stripe.customers.create({
      email,
      metadata: { clerkUserId: userId },
    });
    customerId = customer.id;
    await updateEntitlement(userId, { stripeCustomerId: customerId });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: userId,
    subscription_data: { metadata: { clerkUserId: userId, plan } },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
