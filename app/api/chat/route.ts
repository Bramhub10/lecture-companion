import { NextRequest } from "next/server";
import { streamText } from "ai";
import { gatewayModel } from "@/lib/ai";

export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Answer questions about a single lecture, grounded in its transcript.
 * The transcript is injected into the system prompt so the model can only
 * reason about what was actually said in class.
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, transcript, title } = (await req.json()) as {
      messages: ChatMessage[];
      transcript: string;
      title?: string;
    };

    if (!transcript?.trim()) {
      return new Response("Missing lecture transcript.", { status: 400 });
    }

    const result = streamText({
      model: gatewayModel(req),
      system:
        `You are a study assistant helping a student understand a lecture` +
        (title ? ` titled "${title}"` : "") +
        `. Answer their questions using ONLY the information in the lecture transcript below. ` +
        `Be clear, concise, and helpful — explain concepts, define terms, and clarify what was ` +
        `covered. If something they ask about was not discussed in the lecture, say so plainly ` +
        `rather than guessing, then offer what the lecture did say that's closest.\n\n` +
        `--- LECTURE TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---`,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed.";
    return new Response(message, { status: 500 });
  }
}
