import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { updateEntitlement } from "@/lib/entitlement";
import { syncSubscription, resolveUserIdFromSub, userIdForCustomer } from "@/lib/billing";

/**
 * Stripe webhook — the source of truth for entitlement. Verifies the signature,
 * then syncs plan / status / period into Clerk metadata. No Clerk auth here:
 * Stripe calls this unauthenticated and we trust the signature instead.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return new Response("Webhook not configured.", { status: 400 });
  }

  const stripe = getStripe();
  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.client_reference_id || (session.metadata?.clerkUserId ?? undefined);
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(userId, sub, true);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSub(sub);
        if (userId) await syncSubscription(userId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSub(sub);
        if (userId) {
          await updateEntitlement(userId, { plan: "free", subscriptionStatus: "canceled" });
        }
        break;
      }
      case "invoice.paid": {
        // A renewal succeeded — reset the usage window for the new period.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const userId = await userIdForCustomer(customerId);
          if (userId) await updateEntitlement(userId, { lecturesUsed: 0 });
        }
        break;
      }
    }
  } catch (err) {
    // Log and 500 so Stripe retries rather than silently dropping the event.
    console.error("[stripe webhook] handler failed:", err);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
