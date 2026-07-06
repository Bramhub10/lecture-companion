"use client";

import ChatPanel from "./ChatPanel";
import type { SavedLecture } from "@/lib/history";

/** Chat grounded in every saved lecture at once. */
export default function CourseChat({ history }: { history: SavedLecture[] }) {
  if (history.length === 0) {
    return (
      <EmptyCard>
        Once you&apos;ve captured a few lectures, ask questions that span all of them here —
        &ldquo;what are all my upcoming deadlines?&rdquo; or &ldquo;summarize everything about
        the Krebs cycle across my lectures.&rdquo;
      </EmptyCard>
    );
  }

  const combined = history
    .map(
      (l) =>
        `# ${l.analysis.title} (${new Date(l.savedAt).toLocaleDateString()})\n${l.transcript}`
    )
    .join("\n\n---\n\n");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-lg font-semibold text-slate-900">Chat across all lectures</h3>
      <p className="mb-4 text-sm text-slate-500">
        Grounded in {history.length} saved lecture{history.length > 1 ? "s" : ""}.
      </p>
      <ChatPanel
        transcript={combined}
        title="all of the student's lectures for this course"
        placeholder="Ask across all your lectures…"
        heightClass="max-h-[28rem]"
        suggestions={[
          "What are all my upcoming deadlines?",
          "What topics have we covered so far?",
          "Make a study plan for my next exam",
        ]}
      />
    </section>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
      {children}
    </section>
  );
}
