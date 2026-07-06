"use client";

import { useState } from "react";
import type { SavedLecture } from "@/lib/history";
import type { StudyAids } from "@/lib/schema";
import { keyHeaders } from "@/lib/keys";

/** Generate and study flashcards + a quiz from a chosen lecture. */
export default function StudyView({ history }: { history: SavedLecture[] }) {
  const [selectedId, setSelectedId] = useState(history[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [study, setStudy] = useState<StudyAids | null>(null);

  if (history.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
        Capture a lecture first, then generate flashcards and a practice quiz from it here.
      </section>
    );
  }

  const selected = history.find((l) => l.id === selectedId) ?? history[0];

  const generate = async () => {
    setLoading(true);
    setError(null);
    setStudy(null);
    try {
      const res = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders() },
        body: JSON.stringify({ transcript: selected.transcript, title: selected.analysis.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setStudy(data.study);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate study aids.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Study</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setStudy(null);
            }}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
          >
            {history.map((l) => (
              <option key={l.id} value={l.id}>
                {l.analysis.title}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Generating…" : study ? "Regenerate" : "Generate flashcards & quiz"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {study && (
        <>
          <Flashcards cards={study.flashcards} />
          <Quiz questions={study.quiz} />
        </>
      )}
    </section>
  );
}

function Flashcards({ cards }: { cards: StudyAids["flashcards"] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Flashcards ({cards.length})
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c, i) => (
          <button
            key={i}
            onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
            className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300"
          >
            <div className="text-xs uppercase tracking-wide text-slate-400">
              {flipped[i] ? "Answer" : "Card — tap to flip"}
            </div>
            <div className="mt-1 text-sm text-slate-800">{flipped[i] ? c.back : c.front}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Quiz({ questions }: { questions: StudyAids["quiz"] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Practice quiz ({questions.length})
      </h4>
      <ol className="space-y-5">
        {questions.map((q, qi) => {
          const chosen = picked[qi];
          const answered = chosen !== undefined;
          return (
            <li key={qi}>
              <p className="font-medium text-slate-900">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-2 space-y-1.5">
                {q.choices.map((choice, ci) => {
                  const isCorrect = ci === q.answerIndex;
                  const isChosen = chosen === ci;
                  let style = "border-slate-200 hover:bg-slate-50";
                  if (answered && isCorrect) style = "border-emerald-300 bg-emerald-50 text-emerald-800";
                  else if (answered && isChosen) style = "border-red-300 bg-red-50 text-red-800";
                  return (
                    <button
                      key={ci}
                      disabled={answered}
                      onClick={() => setPicked((p) => ({ ...p, [qi]: ci }))}
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition ${style}`}
                    >
                      {String.fromCharCode(65 + ci)}. {choice}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <p className="mt-2 text-sm text-slate-500">
                  {chosen === q.answerIndex ? "✓ Correct. " : "✕ Not quite. "}
                  {q.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
