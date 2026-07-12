"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { upload } from "@vercel/blob/client";
import type { LectureAnalysis } from "@/lib/schema";
import { googleCalendarUrl, buildIcs } from "@/lib/calendar";
import {
  appendChunk,
  assembleRecording,
  chunkCount,
  clearRecording,
  getMeta,
  setMeta,
} from "@/lib/idb";
import {
  fetchLectures,
  saveLecture,
  deleteLecture,
  migrateLegacyHistory,
  type SavedLecture,
} from "@/lib/history";
import { getKeys, saveKeys, keyHeaders, type ApiKeys } from "@/lib/keys";
import ChatPanel from "./components/ChatPanel";
import CourseChat from "./components/CourseChat";
import CalendarView from "./components/CalendarView";
import StudyView from "./components/StudyView";

type Status = "idle" | "recording" | "processing" | "done" | "error";
type Gcal = { configured: boolean; connected: boolean } | null;
type ServerConfig = { hasServerGateway: boolean; hasServerDeepgram: boolean };
type View = "lecture" | "chat" | "calendar" | "study";

const TABS: { id: View; label: string }[] = [
  { id: "lecture", label: "Lecture" },
  { id: "chat", label: "Chat" },
  { id: "calendar", label: "Calendar" },
  { id: "study", label: "Study" },
];

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function notesMarkdown(a: LectureAnalysis): string {
  const lines: string[] = [`# ${a.title}`, ""];
  if (a.course) lines.push(`**Course:** ${a.course}`, "");
  lines.push(`## TL;DR`, a.tldr, "", `## Summary`, a.summary, "", `## Key Points`);
  a.keyPoints.forEach((k) => lines.push(`- ${k}`));
  if (a.keyTerms.length) {
    lines.push("", `## Key Terms`);
    a.keyTerms.forEach((t) => lines.push(`- **${t.term}** — ${t.definition}`));
  }
  if (a.actionItems.length) {
    lines.push("", `## Action Items`);
    a.actionItems.forEach((t) => lines.push(`- [${t.priority}] ${t.task}`));
  }
  if (a.calendarEvents.length) {
    lines.push("", `## Deadlines & Events`);
    a.calendarEvents.forEach((e) =>
      lines.push(
        `- **${e.title}** (${e.type})${e.date ? ` — ${e.date}` : ""}${e.notes ? ` — ${e.notes}` : ""}`
      )
    );
  }
  if (a.openQuestions.length) {
    lines.push("", `## Open Questions`);
    a.openQuestions.forEach((q) => lines.push(`- ${q}`));
  }
  return lines.join("\n");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LectureAnalysis | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  const [keys, setKeysState] = useState<ApiKeys>({ deepgram: "", gateway: "" });
  const [server, setServer] = useState<ServerConfig>({
    hasServerGateway: false,
    hasServerDeepgram: false,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [recoverable, setRecoverable] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [history, setHistory] = useState<SavedLecture[]>([]);
  const [gcal, setGcal] = useState<Gcal>(null);
  const [gcalNotice, setGcalNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("lecture");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // On mount: load the visitor's own keys, saved lectures, and any recoverable recording.
  useEffect(() => {
    const loaded = getKeys();
    setKeysState(loaded);
    // Ask the server whether it has its own keys. If it doesn't (and the visitor
    // hasn't set one), open Settings so they can bring their own.
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: ServerConfig) => {
        setServer(c);
        if (!loaded.gateway && !c.hasServerGateway) setShowSettings(true);
      })
      .catch(() => {
        if (!loaded.gateway) setShowSettings(true);
      });
    // Migrate any legacy localStorage history to the server, then load from it.
    migrateLegacyHistory()
      .then(() => fetchLectures())
      .then(setHistory)
      .catch(() => {});
    chunkCount().then((n) => setRecoverable(n > 0)).catch(() => {});

    const refreshGcal = () =>
      fetch("/api/google/status")
        .then((r) => r.json())
        .then((g) => setGcal({ configured: g.configured, connected: g.connected }))
        .catch(() => setGcal({ configured: false, connected: false }));
    refreshGcal();

    // Handle the OAuth redirect result, then strip the query param from the URL.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gcal");
    if (result) {
      if (result === "connected") setGcalNotice("Google Calendar connected ✓");
      else if (result === "badstate") setGcalNotice("Connection failed (security check). Try again.");
      else setGcalNotice("Google Calendar connection failed. Try again.");
      window.history.replaceState({}, "", window.location.pathname);
      refreshGcal();
    }
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // Keep the screen awake while recording so the tab isn't throttled/suspended.
  const acquireWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      /* wake lock unsupported or denied — recording still continues */
    }
  }, []);
  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // Warn before leaving mid-recording, and re-acquire the wake lock if the tab
  // was hidden and shown again (browsers auto-release it on hide).
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "recording") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onVisible = () => {
      if (status === "recording" && document.visibilityState === "visible" && !wakeLockRef.current) {
        void acquireWakeLock();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, acquireWakeLock]);

  /** Shared: send a FormData payload to the API, then render + persist the result. */
  const runProcess = useCallback(async (form: FormData, clearAfter: boolean) => {
    setStatus("processing");
    setError(null);
    try {
      form.append("today", new Date().toISOString().slice(0, 10));
      const res = await fetch("/api/process", {
        method: "POST",
        headers: keyHeaders(),
        body: form,
      });
      // Parse defensively: platform-level errors (timeouts, size limits) can come
      // back as plain text/HTML, and calling res.json() on those used to blow up
      // with "Unexpected token ...". Read text first, then try to parse.
      const raw = await res.text();
      let data: { transcript?: string; analysis?: LectureAnalysis; error?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          res.ok ? "The server sent back an unreadable response." : raw.slice(0, 200).trim() || `Request failed (HTTP ${res.status}).`
        );
      }
      if (!res.ok) throw new Error(data.error || "Processing failed.");
      if (!data.transcript || !data.analysis) throw new Error("The server returned an incomplete result.");

      setTranscript(data.transcript);
      setAnalysis(data.analysis);
      const saved = await saveLecture(data.analysis, data.transcript);
      if (saved) setHistory((h) => [saved, ...h]);
      setStatus("done");
      if (clearAfter) {
        await clearRecording().catch(() => {});
        setRecoverable(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }, []);

  /**
   * Upload audio straight to Vercel Blob (bypassing the serverless body-size
   * limit that used to reject full-length lectures), then hand the URL to the
   * processor. `clearAfter` wipes the crash-recovery buffer once a recording is
   * safely transcribed.
   */
  const uploadAndProcess = useCallback(
    async (blob: Blob, filename: string, clearAfter: boolean) => {
      setStatus("processing");
      setError(null);
      try {
        const { url } = await upload(filename, blob, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: blob.type || "audio/webm",
        });
        const form = new FormData();
        form.append("audioUrl", url);
        await runProcess(form, clearAfter);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't upload the recording.");
        setStatus("error");
      }
    },
    [runProcess]
  );

  const processBlob = useCallback(
    (blob: Blob) => uploadAndProcess(blob, `lecture-${Date.now()}.webm`, true),
    [uploadAndProcess]
  );

  const processTranscript = useCallback(() => {
    const text = pasteText.trim();
    if (!text) return;
    const form = new FormData();
    form.append("transcript", text);
    return runProcess(form, false);
  }, [pasteText, runProcess]);

  const startRecording = useCallback(async () => {
    setError(null);
    setAnalysis(null);
    try {
      await clearRecording().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      await setMeta("mimeType", mimeType || "audio/webm");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) void appendChunk(e.data); // persist as we go (crash-safe)
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = await assembleRecording(mimeType || "audio/webm");
        void processBlob(blob);
      };

      recorder.start(5000); // flush a chunk to disk every 5s
      recorderRef.current = recorder;
      setElapsed(0);
      setPaused(false);
      setRecoverable(false);
      setStatus("recording");
      startTimer();
      void acquireWakeLock();
    } catch {
      setError("Couldn't access the microphone. Check browser permissions and try again.");
      setStatus("error");
    }
  }, [processBlob, startTimer]);

  // Gate the first recording behind a one-time consent acknowledgment: the user
  // is responsible for having permission to record (laws + school policy vary).
  const handleRecordClick = useCallback(() => {
    const consented =
      typeof window !== "undefined" &&
      window.localStorage.getItem("lecture-companion:recording-consent");
    if (consented) void startRecording();
    else setShowConsent(true);
  }, [startRecording]);

  const acceptConsent = useCallback(() => {
    try {
      window.localStorage.setItem("lecture-companion:recording-consent", "1");
    } catch {
      /* ignore */
    }
    setShowConsent(false);
    void startRecording();
  }, [startRecording]);

  const togglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      stopTimer();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      startTimer();
      setPaused(false);
    }
  }, [startTimer, stopTimer]);

  const stopRecording = useCallback(() => {
    stopTimer();
    releaseWakeLock();
    recorderRef.current?.stop();
  }, [stopTimer, releaseWakeLock]);

  const recoverRecording = useCallback(async () => {
    const mimeType = (await getMeta<string>("mimeType")) || "audio/webm";
    const blob = await assembleRecording(mimeType);
    if (blob.size === 0) {
      setRecoverable(false);
      return;
    }
    void processBlob(blob);
  }, [processBlob]);

  const discardRecording = useCallback(async () => {
    await clearRecording().catch(() => {});
    setRecoverable(false);
  }, []);

  const onUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void uploadAndProcess(file, file.name, false);
    },
    [uploadAndProcess]
  );

  const openSaved = useCallback((l: SavedLecture) => {
    setAnalysis(l.analysis);
    setTranscript(l.transcript);
    setStatus("done");
  }, []);

  const deleteSaved = useCallback((id: string) => {
    // Optimistic: drop it from the UI now, delete server-side in the background.
    setHistory((h) => h.filter((l) => l.id !== id));
    deleteLecture(id).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setAnalysis(null);
    setTranscript("");
    setError(null);
  }, []);

  const busy = status === "recording" || status === "processing";
  // Either the visitor's own key or the server's key enables a capability.
  const hasGateway = Boolean(keys.gateway) || server.hasServerGateway;
  const hasDeepgram = Boolean(keys.deepgram) || server.hasServerDeepgram;
  const canAnalyze = hasGateway;
  const canTranscribe = hasGateway && hasDeepgram;

  const persistKeys = useCallback((next: ApiKeys) => {
    saveKeys(next);
    setKeysState(next);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">StudyBuddy</h1>
          <p className="mt-2 text-slate-500">
            Open it when class starts. It listens, then hands you clean notes, action items, and
            every deadline ready for your calendar.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href="/pricing"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Plans
          </a>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ⚙ Keys
          </button>
          <UserButton />
        </div>
      </header>

      {showSettings && (
        <SettingsModal
          initial={keys}
          onSave={(next) => {
            persistKeys(next);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Before you record</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              You&rsquo;re responsible for making sure you&rsquo;re allowed to record. Recording laws
              vary by state and country, and your school or instructor may have their own rules. Only
              record where you have permission to do so.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              See our{" "}
              <a href="/terms" className="underline hover:text-slate-600">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline hover:text-slate-600">
                Privacy Policy
              </a>
              .
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowConsent(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={acceptConsent}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                I understand — start
              </button>
            </div>
          </div>
        </div>
      )}

      {(!canAnalyze || !canTranscribe) && (
        <SetupBanner canAnalyze={canAnalyze} onOpenSettings={() => setShowSettings(true)} />
      )}

      {gcalNotice && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          <span>{gcalNotice}</span>
          <button onClick={() => setGcalNotice(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {status === "recording" && view !== "lecture" && (
        <RecordingBar
          elapsed={elapsed}
          paused={paused}
          onPause={togglePause}
          onStop={stopRecording}
        />
      )}

      <TabBar view={view} setView={setView} />

      {view === "lecture" && (
      <>
      {recoverable && status === "idle" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>We found an unfinished recording from a previous session.</span>
          <span className="flex gap-2">
            <button
              onClick={recoverRecording}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-500"
            >
              Recover &amp; summarize
            </button>
            <button
              onClick={discardRecording}
              className="rounded-lg border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100"
            >
              Discard
            </button>
          </span>
        </div>
      )}

      {/* Recorder */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-5">
          {status === "recording" ? (
            <>
              <div className="font-mono text-4xl tabular-nums text-slate-900">
                {formatClock(elapsed)}
              </div>
              <div className="flex items-center gap-2 text-sm text-red-600">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full bg-red-500 ${
                    paused ? "" : "animate-pulse"
                  }`}
                />
                {paused ? "Paused" : "Recording…"}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={togglePause}
                  className="rounded-full border border-slate-300 px-6 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={stopRecording}
                  className="rounded-full bg-slate-900 px-8 py-3 font-medium text-white transition hover:bg-slate-700"
                >
                  Stop &amp; summarize
                </button>
              </div>
            </>
          ) : status === "processing" ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              <p className="text-slate-500">Transcribing and summarizing your lecture…</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleRecordClick}
                disabled={busy}
                className="rounded-full bg-indigo-600 px-10 py-4 text-lg font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                ● Start recording
              </button>
              <div className="flex flex-col items-center gap-1 text-sm text-slate-500">
                <label className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-slate-700">
                  upload an existing recording
                  <input type="file" accept="audio/*" onChange={onUpload} className="hidden" />
                </label>
                <button
                  onClick={() => setShowPaste((s) => !s)}
                  className="underline decoration-dotted underline-offset-4 hover:text-slate-700"
                >
                  or paste a transcript (no mic / no Deepgram key needed)
                </button>
              </div>
              {showPaste && (
                <div className="mt-2 w-full">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste a lecture transcript here…"
                    className="h-36 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    onClick={processTranscript}
                    disabled={!pasteText.trim()}
                    className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Summarize transcript
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {analysis && status === "done" && (
        <Results analysis={analysis} transcript={transcript} onNew={reset} gcal={gcal} />
      )}

      {history.length > 0 && status !== "recording" && status !== "processing" && (
        <PastLectures history={history} onOpen={openSaved} onDelete={deleteSaved} />
      )}
      </>
      )}

      {view === "chat" && <CourseChat history={history} />}
      {view === "calendar" && <CalendarView history={history} gcal={gcal} />}
      {view === "study" && <StudyView history={history} />}

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <a href="/pricing" className="hover:text-slate-600">
          Plans
        </a>
        <span className="mx-2">·</span>
        <a href="/terms" className="hover:text-slate-600">
          Terms
        </a>
        <span className="mx-2">·</span>
        <a href="/privacy" className="hover:text-slate-600">
          Privacy
        </a>
      </footer>
    </main>
  );
}

function TabBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="mb-8 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            view === t.id
              ? "bg-indigo-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function RecordingBar({
  elapsed,
  paused,
  onPause,
  onStop,
}: {
  elapsed: number;
  paused: boolean;
  onPause: () => void;
  onStop: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 mb-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-red-700">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full bg-red-500 ${paused ? "" : "animate-pulse"}`}
        />
        {paused ? "Paused" : "Recording"} · <span className="font-mono">{formatClock(elapsed)}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPause}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={onStop}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Stop &amp; summarize
        </button>
      </div>
    </div>
  );
}

function SetupBanner({
  canAnalyze,
  onOpenSettings,
}: {
  canAnalyze: boolean;
  onOpenSettings: () => void;
}) {
  if (!canAnalyze) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
        <span>
          <strong>Add your own keys to get started.</strong> This app runs on your account, so
          nothing is charged to anyone else. You&apos;ll need a free Vercel AI Gateway key (and a
          Deepgram key to transcribe audio).
        </span>
        <button
          onClick={onOpenSettings}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
        >
          Add keys
        </button>
      </div>
    );
  }
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <span>
        <strong>Audio transcription is off.</strong> Add a Deepgram key to transcribe recordings —
        or paste a transcript below to get notes right now.
      </span>
      <button
        onClick={onOpenSettings}
        className="shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100"
      >
        Add Deepgram key
      </button>
    </div>
  );
}

function SettingsModal({
  initial,
  onSave,
  onClose,
}: {
  initial: ApiKeys;
  onSave: (keys: ApiKeys) => void;
  onClose: () => void;
}) {
  const [deepgram, setDeepgram] = useState(initial.deepgram);
  const [gateway, setGateway] = useState(initial.gateway);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Your API keys</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">
          Keys are stored only in this browser and sent straight to Deepgram / Vercel — never saved
          on our server. All usage runs on your own accounts.
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Vercel AI Gateway key <span className="text-slate-400">(required)</span>
          </span>
          <input
            type="password"
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            placeholder="vck_…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Create one at{" "}
            <a
              href="https://vercel.com/dashboard/ai-gateway"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              vercel.com/dashboard → AI Gateway
            </a>
            . Powers notes, chat &amp; study aids.
          </span>
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Deepgram key <span className="text-slate-400">(optional — for recording audio)</span>
          </span>
          <input
            type="password"
            value={deepgram}
            onChange={(e) => setDeepgram(e.target.value)}
            placeholder="Token…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Get a free key at{" "}
            <a
              href="https://console.deepgram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              console.deepgram.com
            </a>
            . Without it you can still paste a transcript.
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ deepgram, gateway })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Save keys
          </button>
        </div>
      </div>
    </div>
  );
}

function PastLectures({
  history,
  onOpen,
  onDelete,
}: {
  history: SavedLecture[];
  onOpen: (l: SavedLecture) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mt-12">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Past lectures
      </h3>
      <ul className="space-y-2">
        {history.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <button onClick={() => onOpen(l)} className="min-w-0 flex-1 text-left">
              <div className="truncate font-medium text-slate-900">{l.analysis.title}</div>
              <div className="text-xs text-slate-500">
                {new Date(l.savedAt).toLocaleString()}
                {l.analysis.calendarEvents.length
                  ? ` · ${l.analysis.calendarEvents.length} deadline(s)`
                  : ""}
              </div>
            </button>
            <button
              onClick={() => onDelete(l.id)}
              className="shrink-0 text-xs text-slate-400 hover:text-red-600"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Results({
  analysis,
  transcript,
  onNew,
  gcal,
}: {
  analysis: LectureAnalysis;
  transcript: string;
  onNew: () => void;
  gcal: Gcal;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [insertResults, setInsertResults] = useState<
    { title: string; ok: boolean; htmlLink?: string; error?: string }[] | null
  >(null);
  const [insertError, setInsertError] = useState<string | null>(null);
  const datedEvents = analysis.calendarEvents.filter((e) => e.date);

  const addAllToGoogle = async () => {
    setInserting(true);
    setInsertError(null);
    try {
      const res = await fetch("/api/calendar/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: datedEvents,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add events.");
      setInsertResults(data.results);
    } catch (e) {
      setInsertError(e instanceof Error ? e.message : "Failed to add events.");
    } finally {
      setInserting(false);
    }
  };

  return (
    <div className="mt-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{analysis.title}</h2>
          {analysis.course && <p className="text-slate-500">{analysis.course}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onNew}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + New lecture
          </button>
          <button
            onClick={() =>
              download(
                `${analysis.title.replace(/[^\w]+/g, "-").slice(0, 60)}.md`,
                notesMarkdown(analysis),
                "text/markdown"
              )
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ↓ Notes (.md)
          </button>
          {datedEvents.length > 0 && (
            <button
              onClick={() =>
                download("lecture-deadlines.ics", buildIcs(datedEvents), "text/calendar")
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ↓ Calendar (.ics)
            </button>
          )}
        </div>
      </div>

      <Card title="TL;DR">
        <p className="text-slate-700">{analysis.tldr}</p>
      </Card>

      <Card title="Ask about this lecture">
        <ChatPanel transcript={transcript} title={analysis.title} />
      </Card>

      {analysis.calendarEvents.length > 0 && (
        <Card title="Deadlines & events">
          {datedEvents.length > 0 && gcal?.configured && (
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              {gcal.connected ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600">
                    Add all {datedEvents.length} deadline{datedEvents.length > 1 ? "s" : ""} straight
                    to your Google Calendar.
                  </span>
                  <button
                    onClick={addAllToGoogle}
                    disabled={inserting}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {inserting ? "Adding…" : "Add all to Google Calendar"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600">
                    Connect Google Calendar to add every deadline in one click.
                  </span>
                  <a
                    href="/api/google/auth"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    Connect Google Calendar
                  </a>
                </div>
              )}
              {insertError && <p className="mt-2 text-sm text-red-600">{insertError}</p>}
              {insertResults && (
                <ul className="mt-2 space-y-1 text-sm">
                  {insertResults.map((r, i) => (
                    <li key={i} className={r.ok ? "text-emerald-700" : "text-red-600"}>
                      {r.ok ? "✓" : "✕"} {r.title}
                      {r.ok && r.htmlLink && (
                        <a
                          href={r.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 underline decoration-dotted"
                        >
                          view
                        </a>
                      )}
                      {!r.ok && r.error ? ` — ${r.error}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ul className="space-y-3">
            {analysis.calendarEvents.map((e, i) => {
              const url = googleCalendarUrl(e);
              return (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {e.type}
                      </span>
                      <span className="font-medium text-slate-900">{e.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {e.date ? new Date(e.date).toLocaleString() : "No date mentioned"}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                    >
                      + Google Calendar
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400">add date manually</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {analysis.actionItems.length > 0 && (
        <Card title="Action items">
          <ul className="space-y-2">
            {analysis.actionItems.map((t, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                    PRIORITY_STYLE[t.priority]
                  }`}
                >
                  {t.priority}
                </span>
                <span className="text-slate-700">{t.task}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Key points">
        <ul className="list-disc space-y-1.5 pl-5 text-slate-700">
          {analysis.keyPoints.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      </Card>

      {analysis.keyTerms.length > 0 && (
        <Card title="Key terms">
          <dl className="space-y-2">
            {analysis.keyTerms.map((t, i) => (
              <div key={i}>
                <dt className="font-medium text-slate-900">{t.term}</dt>
                <dd className="text-sm text-slate-600">{t.definition}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card title="Full summary">
        <div className="whitespace-pre-wrap leading-relaxed text-slate-700">{analysis.summary}</div>
      </Card>

      {analysis.openQuestions.length > 0 && (
        <Card title="Open questions to revisit">
          <ul className="list-disc space-y-1.5 pl-5 text-slate-700">
            {analysis.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <button
          onClick={() => setShowTranscript((s) => !s)}
          className="text-sm text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-700"
        >
          {showTranscript ? "Hide" : "Show"} raw transcript
        </button>
        {showTranscript && (
          <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {transcript}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}
