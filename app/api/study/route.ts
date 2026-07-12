import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { studySchema } from "@/lib/schema";
import { gatewayModel } from "@/lib/ai";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 120;

/** Generate flashcards + a quiz grounded in a lecture transcript. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  try {
    const { transcript, title } = (await req.json()) as { transcript: string; title?: string };
    if (!transcript?.trim()) {
      return NextResponse.json({ error: "Missing lecture transcript." }, { status: 400 });
    }

    const { object } = await generateObject({
      model: gatewayModel(req),
      schema: studySchema,
      system:
        "You create study material from lecture transcripts. Base everything strictly on the " +
        "transcript — do not introduce facts that were not covered. Make flashcards and quiz " +
        "questions that genuinely test understanding, not trivia.",
      prompt:
        (title ? `Lecture: "${title}".\n\n` : "") +
        `Create study aids from this transcript:\n\n"""\n${transcript}\n"""`,
    });

    return NextResponse.json({ study: object });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate study aids.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
