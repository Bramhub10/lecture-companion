import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { lectureAnalysisSchema } from "@/lib/schema";
import { deepgramKey, gatewayModel } from "@/lib/ai";

// Long lectures need long processing headroom.
export const maxDuration = 300;

const TRANSCRIBE_MODEL = "nova-3";

/** Send audio bytes to Deepgram and return the plain transcript. */
async function transcribe(audio: ArrayBuffer, contentType: string, key: string): Promise<string> {
  const res = await fetch(
    `https://api.deepgram.com/v1/listen?model=${TRANSCRIBE_MODEL}&smart_format=true&punctuate=true&paragraphs=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": contentType || "audio/webm",
      },
      body: audio,
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Deepgram error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  if (!transcript.trim()) throw new Error("Transcription came back empty.");
  return transcript;
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
  try {
    const form = await req.formData();
    const file = form.get("audio");
    const pasted = (form.get("transcript") as string | null)?.trim() || "";
    const today = (form.get("today") as string) || new Date().toISOString().slice(0, 10);

    // Two entry points: a recorded/uploaded audio file, or a pasted transcript
    // (the keyless path — needs no Deepgram key, only the AI Gateway).
    let transcript: string;
    if (pasted) {
      transcript = pasted;
    } else if (file instanceof Blob) {
      transcript = await transcribe(await file.arrayBuffer(), file.type, deepgramKey(req));
    } else {
      return NextResponse.json(
        { error: "Provide either an audio recording or a transcript." },
        { status: 400 }
      );
    }

    const analysis = await analyze(req, transcript, today);
    return NextResponse.json({ transcript, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[process] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
