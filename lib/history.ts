import type { LectureAnalysis } from "./schema";

/**
 * Client-side access to the signed-in user's lectures, now backed by the
 * server (`/api/lectures`) instead of localStorage — so notes persist across
 * devices and survive a cleared browser. The `SavedLecture` shape is unchanged
 * so the views (`CourseChat`, `CalendarView`, `StudyView`, `PastLectures`)
 * need no changes.
 */

export type SavedLecture = {
  id: string;
  savedAt: number; // epoch ms
  analysis: LectureAnalysis;
  transcript: string;
};

const LEGACY_KEY = "lecture-companion:history";
const MIGRATED_FLAG = "lecture-companion:migrated";

/** Load the signed-in user's lectures, newest first. */
export async function fetchLectures(): Promise<SavedLecture[]> {
  try {
    const res = await fetch("/api/lectures");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.lectures as SavedLecture[]) ?? [];
  } catch {
    return [];
  }
}

/** Persist a new lecture; returns the created row (or null on failure). */
export async function saveLecture(
  analysis: LectureAnalysis,
  transcript: string
): Promise<SavedLecture | null> {
  try {
    const res = await fetch("/api/lectures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysis, transcript }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.lecture as SavedLecture) ?? null;
  } catch {
    return null;
  }
}

/** Delete a lecture by id. Returns true if it was removed. */
export async function deleteLecture(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/lectures/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One-time migration: upload any lectures still sitting in the old
 * localStorage history to the server (oldest-first so ordering is preserved),
 * then clear it. Runs at most once per browser (guarded by a flag). No-op on
 * the server or when there's nothing to migrate.
 */
export async function migrateLegacyHistory(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(MIGRATED_FLAG)) return false;
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      window.localStorage.setItem(MIGRATED_FLAG, "1");
      return false;
    }
    const list = JSON.parse(raw) as SavedLecture[];
    let migrated = false;
    for (const l of [...list].reverse()) {
      if (await saveLecture(l.analysis, l.transcript)) migrated = true;
    }
    window.localStorage.setItem(MIGRATED_FLAG, "1");
    window.localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return false;
  }
}
