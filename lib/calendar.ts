import type { LectureAnalysis } from "./schema";

type CalEvent = LectureAnalysis["calendarEvents"][number];

/**
 * Turn a loosely-specified ISO date (possibly just YYYY-MM-DD, possibly null)
 * into concrete start/end Date objects for calendar formats.
 * Deadlines with no time default to a 9am-10am block; explicit datetimes are honored.
 */
function resolveTimes(ev: CalEvent): { start: Date; end: Date } | null {
  if (!ev.date) return null;
  const hasTime = ev.date.includes("T");
  const start = new Date(hasTime ? ev.date : `${ev.date}T09:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

/** Compact UTC stamp used by Google Calendar links and ICS: YYYYMMDDTHHMMSSZ */
function toStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** All-day dates in ICS/Google are YYYYMMDD. */
function toDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Build a "one click to add" Google Calendar link for a single event.
 * Requires no OAuth — opens Google Calendar's event-create screen prefilled.
 */
export function googleCalendarUrl(ev: CalEvent): string | null {
  const times = resolveTimes(ev);
  if (!times) return null;

  const dates = ev.allDay
    ? `${toDateStamp(times.start)}/${toDateStamp(
        new Date(times.start.getTime() + 24 * 60 * 60 * 1000)
      )}`
    : `${toStamp(times.start)}/${toStamp(times.end)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
    details: ev.notes || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape a value for the ICS text format. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Produce a full .ics calendar file for every event that has a resolvable date.
 * Importable into Google Calendar, Apple Calendar, Outlook, etc.
 */
export function buildIcs(events: CalEvent[], calendarName = "Lecture Deadlines"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lecture Agent//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];

  events.forEach((ev, i) => {
    const times = resolveTimes(ev);
    if (!times) return;
    const uid = `lecture-agent-${Date.now()}-${i}@local`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${toStamp(new Date())}`);
    if (ev.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${toDateStamp(times.start)}`,
        `DTEND;VALUE=DATE:${toDateStamp(
          new Date(times.start.getTime() + 24 * 60 * 60 * 1000)
        )}`
      );
    } else {
      lines.push(`DTSTART:${toStamp(times.start)}`, `DTEND:${toStamp(times.end)}`);
    }
    lines.push(
      `SUMMARY:${icsEscape(`[${ev.type}] ${ev.title}`)}`,
      `DESCRIPTION:${icsEscape(ev.notes || "")}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(`Reminder: ${ev.title}`)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
