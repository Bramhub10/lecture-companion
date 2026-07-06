"use client";

import { useMemo, useState } from "react";
import type { SavedLecture } from "@/lib/history";
import type { LectureAnalysis } from "@/lib/schema";
import { googleCalendarUrl, buildIcs } from "@/lib/calendar";

type CalEvent = LectureAnalysis["calendarEvents"][number];
type FlatEvent = CalEvent & { from: string };
type Gcal = { configured: boolean; connected: boolean } | null;

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TYPE_COLOR: Record<string, string> = {
  exam: "bg-red-100 text-red-700",
  quiz: "bg-orange-100 text-orange-700",
  assignment: "bg-indigo-100 text-indigo-700",
  project: "bg-purple-100 text-purple-700",
  reading: "bg-emerald-100 text-emerald-700",
  class: "bg-slate-100 text-slate-600",
  other: "bg-slate-100 text-slate-600",
};

/** Aggregated agenda of every deadline across all saved lectures. */
export default function CalendarView({ history, gcal }: { history: SavedLecture[]; gcal: Gcal }) {
  const [inserting, setInserting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const events = useMemo<FlatEvent[]>(() => {
    const all: FlatEvent[] = [];
    for (const l of history) {
      for (const e of l.analysis.calendarEvents) {
        if (e.date) all.push({ ...e, from: l.analysis.title });
      }
    }
    return all.sort((a, b) => (a.date! < b.date! ? -1 : 1));
  }, [history]);

  const upcoming = events.filter((e) => new Date(e.date!) >= new Date(new Date().toDateString()));

  const addAll = async () => {
    setInserting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/calendar/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      const ok = data.results.filter((r: { ok: boolean }) => r.ok).length;
      setNotice(`Added ${ok} of ${data.results.length} events to Google Calendar.`);
    } catch (e) {
      setNotice("⚠️ " + (e instanceof Error ? e.message : "Failed to add events."));
    } finally {
      setInserting(false);
    }
  };

  if (events.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
        No dated deadlines yet. Deadlines the professor mentions in your lectures show up here.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Calendar</h3>
          <p className="text-sm text-slate-500">
            {upcoming.length} upcoming · {events.length} total across {history.length} lecture
            {history.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => download("all-deadlines.ics", buildIcs(events), "text/calendar")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ↓ Export all (.ics)
          </button>
          {gcal?.configured &&
            (gcal.connected ? (
              <button
                onClick={addAll}
                disabled={inserting}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {inserting ? "Adding…" : "Add all to Google"}
              </button>
            ) : (
              <a
                href="/api/google/auth"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Connect Google Calendar
              </a>
            ))}
        </div>
      </div>

      {notice && <p className="mb-3 text-sm text-slate-600">{notice}</p>}

      <ul className="space-y-2">
        {events.map((e, i) => {
          const past = new Date(e.date!) < new Date(new Date().toDateString());
          const url = googleCalendarUrl(e);
          return (
            <li
              key={i}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                past ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      TYPE_COLOR[e.type] || TYPE_COLOR.other
                    }`}
                  >
                    {e.type}
                  </span>
                  <span className="font-medium text-slate-900">{e.title}</span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {new Date(e.date!).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {" · "}
                  {e.from}
                </p>
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  + Add
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
