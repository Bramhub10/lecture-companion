import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getEntitlement, lectureLimit } from "@/lib/entitlement";
import { PLANS } from "@/lib/plans";

/** Report the signed-in user's plan + usage for the header pill and pricing page. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const ent = await getEntitlement(userId);
  const def = PLANS[ent.plan];
  return NextResponse.json({
    plan: ent.plan,
    planName: def.name,
    lecturesUsed: ent.lecturesUsed,
    limit: lectureLimit(ent.plan),
    unlimited: Boolean(def.unlimited),
    hasSubscription: Boolean(ent.stripeCustomerId) && ent.plan !== "free",
    subscriptionStatus: ent.subscriptionStatus ?? null,
  });
}
