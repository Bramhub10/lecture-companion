"use client";

import { useEffect, useRef, useState } from "react";
import { keyHeaders } from "@/lib/keys";

type ChatMsg = { role: "user" | "assistant"; content: string };

const DEFAULT_SUGGESTIONS = [
  "Explain the main concept simply",
  "What do I need to study for the exam?",
  "Give me 3 quiz questions on this",
];

/**
 * Streaming chat grounded in a transcript. Reused for a single lecture and for
 * the whole-course chat (which passes all transcripts concatenated).
 */
export default function ChatPanel({
  transcript,
  title,
  suggestions = DEFAULT_SUGGESTIONS,
  placeholder = "Ask anything about the lecture…",
  heightClass = "max-h-96",
}: {
  transcript: string;
  title: string;
  suggestions?: string[];
  placeholder?: string;
  heightClass?: string;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || streaming) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders() },
        body: JSON.stringify({ messages: next, transcript, title }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "Chat failed.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "⚠️ " + (e instanceof Error ? e.message : "Something went wrong."),
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div>
      {messages.length > 0 && (
        <div ref={scrollRef} className={`mb-3 ${heightClass} space-y-3 overflow-y-auto pr-1`}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {m.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
