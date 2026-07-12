"use client";

import { useEffect, useState } from "react";

/** Landing page after Stripe Checkout — confirms the subscription, then returns home. */
export default function CheckoutSuccess() {
  const [message, setMessage] = useState("Finishing up your subscription…");

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      window.location.href = "/";
      return;
    }
    fetch("/api/stripe/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => {
        // Even if confirm lags, the webhook will catch up — send them back either way.
        window.location.href = res.ok ? "/?upgraded=1" : "/";
      })
      .catch(() => setMessage("You're subscribed — you can head back to StudyBuddy."));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-slate-700">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-medium text-slate-900">{message}</p>
        <p className="mt-2 text-sm text-slate-500">This only takes a moment.</p>
      </div>
    </main>
  );
}
