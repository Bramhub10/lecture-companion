import type { LectureAnalysis } from "./schema";

/**
 * Past-lecture history, persisted in localStorage so a refresh never loses notes.
 * Kept client-side and simple for now; a real database is the future upgrade.
 */

const KEY = "lecture-companion:history";
const MAX = 50;

export type SavedLecture = {
  id: string;
  savedAt: number; // epoch ms
  analysis: LectureAnalysis;
  transcript: string;
};

export function loadHistory(): SavedLecture[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedLecture[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedLecture[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

/** Save a new lecture at the top of the list and return the updated history. */
export function saveLecture(analysis: LectureAnalysis, transcript: string): SavedLecture[] {
  const entry: SavedLecture = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    analysis,
    transcript,
  };
  const next = [entry, ...loadHistory()];
  write(next);
  return next;
}

export function removeLecture(id: string): SavedLecture[] {
  const next = loadHistory().filter((l) => l.id !== id);
  write(next);
  return next;
}
