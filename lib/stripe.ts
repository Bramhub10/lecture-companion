import Stripe from "stripe";

/**
 * Lazily-constructed shared Stripe client. Constructing lazily avoids throwing
 * at import/build time when STRIPE_SECRET_KEY isn't present; the pinned API
 * version comes from the installed SDK.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    client = new Stripe(key);
  }
  return client;
}
