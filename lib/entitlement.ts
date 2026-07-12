import { clerkClient } from "@clerk/nextjs/server";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * A user's billing entitlement, persisted in Clerk `privateMetadata`
 * (Stripe is the source of truth; the webhook keeps this in sync).
 */
export interface Entitlement {
  plan: PlanId;
  stripeCustomerId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: number; // unix seconds
  lecturesUsed: number; // within the current billing window (lifetime for free)
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const md = (user.privateMetadata ?? {}) as Partial<Entitlement>;
  return {
    plan: md.plan ?? "free",
    stripeCustomerId: md.stripeCustomerId,
    subscriptionStatus: md.subscriptionStatus,
    currentPeriodEnd: md.currentPeriodEnd,
    lecturesUsed: md.lecturesUsed ?? 0,
  };
}

/** Merge a patch into the user's entitlement metadata (preserves other keys). */
export async function updateEntitlement(userId: string, patch: Partial<Entitlement>): Promise<void> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const existing = (user.privateMetadata ?? {}) as Record<string, unknown>;
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: { ...existing, ...patch },
  });
}

export function lectureLimit(plan: PlanId): number {
  return PLANS[plan].lectureLimit;
}

export function canRecordLecture(ent: Entitlement): boolean {
  return ent.lecturesUsed < lectureLimit(ent.plan);
}

/** Increment usage after a lecture is successfully processed. */
export async function recordLecture(userId: string): Promise<void> {
  const ent = await getEntitlement(userId);
  await updateEntitlement(userId, { lecturesUsed: ent.lecturesUsed + 1 });
}
