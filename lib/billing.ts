import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { planForPriceId } from "@/lib/plans";
import { updateEntitlement, type Entitlement } from "@/lib/entitlement";

/**
 * Write plan + status + period from a Stripe subscription into the user's
 * Clerk entitlement. Shared by the webhook (authoritative) and the
 * checkout-success confirm route (fast path so the upgrade shows immediately).
 */
export async function syncSubscription(
  userId: string,
  sub: Stripe.Subscription,
  resetUsage = false
): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? planForPriceId(priceId) : undefined;
  const patch: Partial<Entitlement> = {
    subscriptionStatus: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    // Period end lives on the subscription item in current API versions.
    currentPeriodEnd: sub.items.data[0]?.current_period_end,
  };
  if (plan) patch.plan = plan;
  if (resetUsage) patch.lecturesUsed = 0;
  await updateEntitlement(userId, patch);
}

/** Look up the Clerk user id we stored on a Stripe customer. */
export async function userIdForCustomer(customerId: string): Promise<string | undefined> {
  const customer = await getStripe().customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) return undefined;
  return (customer as Stripe.Customer).metadata?.clerkUserId || undefined;
}

/** Map a subscription back to a Clerk user via metadata, falling back to the customer. */
export async function resolveUserIdFromSub(sub: Stripe.Subscription): Promise<string | undefined> {
  if (sub.metadata?.clerkUserId) return sub.metadata.clerkUserId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return userIdForCustomer(customerId);
}
