/**
 * Plan catalog — the single source of truth for tiers, prices, and lecture caps.
 * Display fields are safe to import on the client; the `planPriceId` /
 * `planForPriceId` helpers read env and are server-only.
 */
export type PlanId = "free" | "basic" | "plus" | "unlimited";

export interface PlanDef {
  id: PlanId;
  name: string;
  amountCents: number;
  /** Lectures allowed per billing period. Free is a one-time lifetime allowance. */
  lectureLimit: number;
  /** Present the cap as "Unlimited" while still enforcing it as a fair-use guard. */
  unlimited?: boolean;
  tagline: string;
  features: string[];
  /** Env var holding this plan's Stripe Price id (null for the free tier). */
  priceEnv: string | null;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    amountCents: 0,
    lectureLimit: 3,
    tagline: "Try it out",
    priceEnv: null,
    features: ["3 lectures total", "AI notes & deadlines", "Flashcards & quizzes", "No card required"],
  },
  basic: {
    id: "basic",
    name: "Basic",
    amountCents: 600,
    lectureLimit: 15,
    tagline: "A class or two",
    priceEnv: "STRIPE_PRICE_BASIC",
    features: ["15 lectures / month", "AI notes & deadlines", "Flashcards & quizzes", "Lecture chat"],
  },
  plus: {
    id: "plus",
    name: "Plus",
    amountCents: 1200,
    lectureLimit: 40,
    tagline: "Full course load",
    priceEnv: "STRIPE_PRICE_PLUS",
    features: ["40 lectures / month", "Everything in Basic", "Course-wide chat", "Priority processing"],
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    amountCents: 1800,
    lectureLimit: 80,
    unlimited: true,
    tagline: "Power users",
    priceEnv: "STRIPE_PRICE_UNLIMITED",
    features: ["Unlimited lectures*", "Everything in Plus", "*fair use ~80 / month", "Earliest new features"],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "basic", "plus", "unlimited"];
export const PAID_PLAN_IDS: PlanId[] = ["basic", "plus", "unlimited"];

export function priceLabel(p: PlanDef): string {
  if (p.amountCents === 0) return "Free";
  const dollars = p.amountCents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}/mo`;
}

/** Server-only: resolve a plan's configured Stripe Price id from the environment. */
export function planPriceId(id: PlanId): string | undefined {
  const env = PLANS[id].priceEnv;
  return env ? process.env[env] : undefined;
}

/** Server-only: reverse-map a Stripe Price id back to our plan id. */
export function planForPriceId(priceId: string): PlanId | undefined {
  return PAID_PLAN_IDS.find((id) => planPriceId(id) === priceId);
}
