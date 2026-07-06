import { z } from "zod";

/**
 * The structured analysis Claude produces from a lecture transcript.
 * Everything the UI renders and everything we push to the calendar
 * comes out of this single object.
 */
export const lectureAnalysisSchema = z.object({
  title: z
    .string()
    .describe(
      "A concise, descriptive title for this lecture (e.g. 'CS 106 — Hash Tables & Collision Resolution')."
    ),
  course: z
    .string()
    .nullable()
    .describe("The course name or code if mentioned, otherwise null."),
  tldr: z
    .string()
    .describe("A 2-3 sentence plain-language summary of the whole lecture."),
  summary: z
    .string()
    .describe(
      "A thorough summary in Markdown. Use headings and bullet points. Cover the main narrative and how ideas connect."
    ),
  keyPoints: z
    .array(z.string())
    .describe("The most important takeaways, each a single crisp sentence."),
  keyTerms: z
    .array(
      z.object({
        term: z.string(),
        definition: z.string(),
      })
    )
    .describe("Important vocabulary or concepts introduced, with definitions."),
  actionItems: z
    .array(
      z.object({
        task: z.string().describe("What the student needs to do."),
        priority: z.enum(["high", "medium", "low"]),
      })
    )
    .describe(
      "Concrete things the student must do: readings, problem sets, prep, follow-ups."
    ),
  calendarEvents: z
    .array(
      z.object({
        title: z
          .string()
          .describe("Short event title, e.g. 'Problem Set 3 due' or 'Midterm Exam'."),
        type: z
          .enum(["assignment", "exam", "quiz", "reading", "project", "class", "other"])
          .describe("Category of the deadline or event."),
        // Dates are ISO 8601. If only a date is known (no time), use YYYY-MM-DD.
        date: z
          .string()
          .nullable()
          .describe(
            "ISO date or datetime for the event. Null if the lecture gave no resolvable date."
          ),
        allDay: z
          .boolean()
          .describe("True if this is a day-level deadline with no specific time."),
        notes: z
          .string()
          .describe("Any details mentioned: chapters, page ranges, weight, requirements."),
      })
    )
    .describe(
      "Every deadline, exam, assignment, or scheduled item the professor mentioned. Empty array if none."
    ),
  openQuestions: z
    .array(z.string())
    .describe(
      "Things left unclear or flagged to revisit — useful for study and office hours."
    ),
});

export type LectureAnalysis = z.infer<typeof lectureAnalysisSchema>;

/** Study aids (flashcards + a multiple-choice quiz) generated from a lecture. */
export const studySchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().describe("A question, term, or prompt."),
        back: z.string().describe("The answer or explanation."),
      })
    )
    .describe("8-12 flashcards covering the most important facts, terms, and concepts."),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        choices: z.array(z.string()).describe("Exactly 4 plausible answer choices."),
        answerIndex: z.number().int().describe("0-based index of the correct choice."),
        explanation: z.string().describe("Why the correct answer is right."),
      })
    )
    .describe("5-8 multiple-choice questions testing understanding of the lecture."),
});

export type StudyAids = z.infer<typeof studySchema>;
