/**
 * One-off: create the StudyBuddy subscription Product + 3 monthly Prices.
 *
 * Usage (from the project root), with a TEST key for test prices:
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/create-stripe-prices.mjs
 * or, if STRIPE_SECRET_KEY is already in .env.local:
 *   node scripts/create-stripe-prices.mjs
 *
 * Run once per mode (test, then later live). It prints the env lines to paste.
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";

function loadKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^STRIPE_SECRET_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* fall through */
  }
  throw new Error("Set STRIPE_SECRET_KEY (in .env.local or inline) before running.");
}

const stripe = new Stripe(loadKey());

const TIERS = [
  { plan: "basic", name: "Basic", amount: 600 },
  { plan: "plus", name: "Plus", amount: 1200 },
  { plan: "unlimited", name: "Unlimited", amount: 1800 },
];

const product = await stripe.products.create({
  name: "StudyBuddy Subscription",
  description: "Lecture recording, AI notes, flashcards and quizzes for students.",
});
console.log(`Product: ${product.id}`);

const lines = [];
for (const t of TIERS) {
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: t.amount,
    currency: "usd",
    recurring: { interval: "month" },
    nickname: `StudyBuddy ${t.name} (monthly)`,
    metadata: { plan: t.plan },
  });
  console.log(`  ${t.name}: $${t.amount / 100}/mo → ${price.id}`);
  lines.push(`STRIPE_PRICE_${t.plan.toUpperCase()}=${price.id}`);
}

console.log("\n--- Add these to .env.local ---\n" + lines.join("\n") + "\n");
