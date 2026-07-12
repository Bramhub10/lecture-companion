import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { generateObject } from "ai";
import { lectureAnalysisSchema } from "@/lib/schema";
import { deepgramKey, gatewayModel } from "@/lib/ai";
import { auth } from "@clerk/nextjs/server";
import { getEntitlement, canRecordLecture, recordLecture } from "@/lib/entitlement";

// Long lectures need long processing headroom.
export const maxDuration = 300;

const TRANSCRIBE_MODEL = "nova-3";
const DEEPGRAM_URL = `https://api.deepgram.com/v1/listen?model=${TRANSCRIBE_MODEL}&smart_format=true&punctuate=true&paragraphs=true`;

function extractTranscript(data: unknown): string {
  const transcript: string =
    (data as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } })
      ?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  if (!transcript.trim()) throw new Error("Transcription came back empty.");
  return transcript;
}

/**
 * Transcribe audio that already lives at a public Blob URL. Deepgram fetches the
 * file itself, so a 90-minute lecture never has to squeeze through our function's
 * request-body limit — this is the path that makes long recordings work.
 */
async function transcribeUrl(audioUrl: string, key: string): Promise<string> {
  const res = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: audioUrl }),
  });
  if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${await res.text()}`);
  return extractTranscript(await res.json());
}

/** Fallback for small in-band uploads: send raw audio bytes to Deepgram. */
async function transcribeBytes(audio: ArrayBuffer, contentType: string, key: string): Promise<string> {
  const res = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": contentType || "audio/webm" },
    body: audio,
  });
  if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${await res.text()}`);
  return extractTranscript(await res.json());
}

/** Ask Claude to turn a raw transcript into the structured lecture analysis. */
async function analyze(req: NextRequest, transcript: string, today: string) {
  const { object } = await generateObject({
    model: gatewayModel(req),
    schema: lectureAnalysisSchema,
    system:
      "You are a diligent teaching assistant who turns raw lecture transcripts into clear, " +
      "well-organized study notes. Transcripts are auto-generated and may contain errors, " +
      "filler, and tangents — infer the intended meaning and ignore noise. Be accurate and " +
      "never invent facts, dates, or deadlines that were not stated or clearly implied.",
    prompt:
      `Today's date is ${today}. Resolve any relative dates the professor mentions ` +
      `("next Friday", "in two weeks", "by the end of the month") into concrete ISO dates ` +
      `relative to today. If a date is genuinely ambiguous, set it to null.\n\n` +
      `Analyze the following lecture transcript:\n\n"""\n${transcript}\n"""`,
  });
  return object;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  // Enforce the plan's lecture allowance before doing any paid work.
  const ent = await getEntitlement(userId);
  if (!canRecordLecture(ent)) {
    return NextResponse.json(
      {
        error:
          ent.plan === "free"
            ? "You've used your 3 free lectures. Open Plans to pick a subscription and keep going."
            : "You've hit your plan's lecture limit for this billing period. Open Plans to move up a tier.",
        limitReached: true,
        plan: ent.plan,
      },
      { status: 402 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("audio");
    const audioUrl = (form.get("audioUrl") as string | null)?.trim() || "";
    const pasted = (form.get("transcript") as string | null)?.trim() || "";
    const today = (form.get("today") as string) || new Date().toISOString().slice(0, 10);

    // Three entry points, in priority order:
    //  1. pasted transcript (keyless path — needs only the AI Gateway),
    //  2. audioUrl — audio the browser already uploaded to Blob (the main path;
    //     Deepgram fetches it, so lecture length is unbounded),
    //  3. an in-band audio Blob (fallback for small direct uploads).
    let transcript: string;
    if (pasted) {
      transcript = pasted;
    } else if (audioUrl) {
      transcript = await transcribeUrl(audioUrl, deepgramKey(req));
      // Audio has served its purpose — remove it so we don't retain recordings.
      await del(audioUrl).catch(() => {});
    } else if (file instanceof Blob) {
      transcript = await transcribeBytes(await file.arrayBuffer(), file.type, deepgramKey(req));
    } else {
      return NextResponse.json(
        { error: "Provide either an audio recording or a transcript." },
        { status: 400 }
      );
    }

    const analysis = await analyze(req, transcript, today);
    await recordLecture(userId); // count this lecture against the plan allowance
    return NextResponse.json({ transcript, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[process] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
