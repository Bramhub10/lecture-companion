"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PLANS, PLAN_ORDER, priceLabel, type PlanId } from "@/lib/plans";

type Entitlement = {
  plan: PlanId;
  planName: string;
  lecturesUsed: number;
  limit: number;
  unlimited: boolean;
  hasSubscription: boolean;
};

export default function PricingPage() {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [busy, setBusy] = useState<PlanId | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/entitlement")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEnt)
      .catch(() => {});
  }, []);

  async function subscribe(plan: PlanId) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Could not start checkout.");
    } catch {
      setError("Could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Could not open billing portal.");
    } catch {
      setError("Could not open billing portal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 text-slate-800">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Plans</h1>
          <p className="mt-2 text-slate-500">
            Pick the plan that fits your course load. Cancel anytime.
          </p>
          {ent && (
            <p className="mt-2 text-sm text-slate-600">
              Current plan: <span className="font-medium">{ent.planName}</span> ·{" "}
              {ent.unlimited ? "unlimited" : `${ent.lecturesUsed}/${ent.limit}`} lectures used
            </p>
          )}
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          ← Back
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = ent?.plan === id;
          const isPaid = id !== "free";
          const highlight = id === "plus"; // nudge toward the middle tier
          return (
            <div
              key={id}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                highlight ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                {highlight && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{priceLabel(plan)}</p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-slate-400">•</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <span className="block rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-500">
                    Current plan
                  </span>
                ) : isPaid ? (
                  <button
                    onClick={() => subscribe(id)}
                    disabled={busy !== null}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    {busy === id ? "Starting…" : "Choose " + plan.name}
                  </button>
                ) : (
                  <span className="block rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-400">
                    Free tier
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ent?.hasSubscription && (
        <div className="mt-6">
          <button
            onClick={manage}
            disabled={busy !== null}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        </div>
      )}
    </main>
  );
}
