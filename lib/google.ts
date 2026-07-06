import { cookies } from "next/headers";
import type { LectureAnalysis } from "./schema";

/**
 * Minimal Google OAuth + Calendar helper (no SDK, just fetch).
 *
 * Tokens are kept in an httpOnly cookie — fine for this single-user, local-first
 * app. A multi-user deployment would move these into a database keyed by user.
 */

const TOKEN_COOKIE = "gcal_token";
const STATE_COOKIE = "gcal_state";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expiry: number; // epoch ms
};

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";
  return { clientId, clientSecret, redirectUri };
}

export function isConfigured(): boolean {
  const { clientId, clientSecret } = googleConfig();
  return Boolean(clientId && clientSecret);
}

/** Build the consent-screen URL and the CSRF state to store. */
export function buildAuthUrl(): { url: string; state: string } {
  const { clientId, redirectUri } = googleConfig();
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // ensure we always get a refresh token
    state,
  });
  return { url: `${AUTH_URL}?${params.toString()}`, state };
}

async function persistTokens(t: TokenSet) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, JSON.stringify(t), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}

/** Exchange an auth code for tokens and store them. */
export async function exchangeCode(code: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  await persistTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
}

async function readTokens(): Promise<TokenSet | null> {
  const store = await cookies();
  const raw = store.get(TOKEN_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export async function isConnected(): Promise<boolean> {
  return (await readTokens()) !== null;
}

export async function disconnect(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}

export async function readState(): Promise<string | undefined> {
  return (await cookies()).get(STATE_COOKIE)?.value;
}
export async function setState(state: string): Promise<void> {
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

/** Return a valid access token, refreshing if it has expired. */
async function getAccessToken(): Promise<string> {
  const tokens = await readTokens();
  if (!tokens) throw new Error("Not connected to Google Calendar.");
  if (Date.now() < tokens.expiry - 60_000) return tokens.access_token;

  if (!tokens.refresh_token) throw new Error("Session expired — please reconnect Google Calendar.");
  const { clientId, clientSecret } = googleConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  const next: TokenSet = {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token, // refresh tokens persist across refreshes
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await persistTokens(next);
  return next.access_token;
}

type CalEvent = LectureAnalysis["calendarEvents"][number];

/** Map one extracted event into the Google Calendar event body. */
function toGoogleEvent(ev: CalEvent, timeZone: string) {
  const summary = `${ev.title}`;
  const description = ev.notes || "";
  if (ev.allDay || !ev.date!.includes("T")) {
    const day = ev.date!.slice(0, 10);
    const end = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { summary, description, start: { date: day }, end: { date: end } };
  }
  const start = new Date(ev.date!);
  const endIso = new Date(start.getTime() + 3_600_000).toISOString();
  return {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: endIso, timeZone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }] },
  };
}

export type InsertResult = { title: string; ok: boolean; htmlLink?: string; error?: string };

/** Insert the given events into the user's primary calendar. */
export async function insertEvents(
  events: CalEvent[],
  timeZone: string
): Promise<InsertResult[]> {
  const token = await getAccessToken();
  const results: InsertResult[] = [];

  for (const ev of events) {
    if (!ev.date) {
      results.push({ title: ev.title, ok: false, error: "no date" });
      continue;
    }
    try {
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(toGoogleEvent(ev, timeZone)),
        }
      );
      if (!res.ok) {
        results.push({ title: ev.title, ok: false, error: `${res.status}` });
      } else {
        const data = await res.json();
        results.push({ title: ev.title, ok: true, htmlLink: data.htmlLink });
      }
    } catch (e) {
      results.push({ title: ev.title, ok: false, error: e instanceof Error ? e.message : "error" });
    }
  }
  return results;
}
