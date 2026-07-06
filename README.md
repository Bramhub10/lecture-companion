# Lecture Companion 🎧

Open it when class starts. It records the lecture, transcribes it, and hands you
back clean study notes — a summary, key points, key terms, action items, open
questions, and **every deadline the professor mentioned, ready to drop into Google
Calendar with one click.**

## How it works

```
🎙️  Record in browser  →  📝 Deepgram transcribes  →  🧠 Claude summarizes & extracts deadlines  →  📅 Calendar links + notes
```

1. **Record** — Click *Start recording* at the beginning of class. Everything runs off your
   mic in the browser; press *Stop & summarize* when class ends.
2. **Transcribe** — The audio is sent to the `/api/process` route and transcribed by
   Deepgram (handles full 60–90 minute lectures in one request).
3. **Summarize** — Claude turns the raw transcript into structured notes and pulls out
   assignments, exams, and due dates, resolving relative dates ("next Friday") against today.
4. **Stay on top** — Each deadline gets a one-click **+ Google Calendar** button, plus a
   downloadable `.ics` file for all of them and a `.md` file of the full notes.

## Setup

```bash
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

| Variable | What it's for | Where to get it |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | Speech-to-text | https://console.deepgram.com |
| `AI_GATEWAY_API_KEY` | Claude via Vercel AI Gateway | Vercel dashboard → AI Gateway (auto-provided on Vercel deploys) |
| `ANALYSIS_MODEL` | *(optional)* which Claude model | defaults to `anthropic/claude-sonnet-5` |

> Mic recording needs a secure context — `localhost` works in dev; use HTTPS in production
> (Vercel provides this automatically).

## Google Calendar auto-insert (optional)

By default, each deadline gets a one-click **+ Google Calendar** link and an `.ics` export —
no setup. To let the app write events **directly** into your calendar, add OAuth credentials:

1. Go to **console.cloud.google.com** → create/select a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → choose **External**, fill the basics, and add
   your own Google account under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type **Web
   application**. Under **Authorized redirect URIs** add:
   `http://localhost:3000/api/google/callback`
5. Copy the **Client ID** and **Client secret** into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
   ```
6. Restart `npm run dev`. A **Connect Google Calendar** button appears on any lecture with
   deadlines; after connecting, use **Add all to Google Calendar**.

Scope used is `calendar.events` (create events only). Tokens are stored in an httpOnly cookie.
For a hosted deployment, update the redirect URI to your domain and add it in Google Console.

## Deploy your own copy

Want your own private instance running on **your** keys? Click the button, and Vercel will
copy this app into your account and prompt you for the two keys below:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBramhub10%2Flecture-companion&env=AI_GATEWAY_API_KEY,DEEPGRAM_API_KEY&envDescription=Your%20own%20Vercel%20AI%20Gateway%20and%20Deepgram%20keys&envLink=https%3A%2F%2Fgithub.com%2FBramhub10%2Flecture-companion%23deploy-your-own-copy&project-name=lecture-companion&repository-name=lecture-companion)

You'll be asked for:

| Variable | What it's for | Where to get it |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Claude via Vercel AI Gateway (notes, chat, study) | Vercel dashboard → AI Gateway |
| `DEEPGRAM_API_KEY` | Speech-to-text for recordings | https://console.deepgram.com |

That's it — once it deploys, open your new URL and start recording. Everything runs on your
own accounts; nobody else is billed.

> Prefer not to set keys at deploy time? You can also deploy with **no** keys and enter them
> in-browser via the **⚙ Keys** panel — they're stored only in your browser and sent per
> request. Handy if several people want to share one deployment but each pay for their own use.

### Or deploy from the CLI

```bash
npx vercel        # preview
npx vercel --prod # production
```

Then add `AI_GATEWAY_API_KEY` and `DEEPGRAM_API_KEY` under the project's **Environment
Variables**. (The app requires an explicit key — it never silently bills the deployment owner
via OIDC.)

## Notes & limitations

- **Calendar** uses zero-auth Google Calendar "add event" links + `.ics` export, so there's
  nothing to authorize. Fully automatic insertion (Google OAuth writing straight to your
  calendar) is a natural next step.
- **Privacy** — audio is streamed to Deepgram for transcription and the transcript to Claude
  via the AI Gateway. This app stores nothing server-side.
- **Long lectures** — the whole recording uploads at once on stop; very long sessions make
  large uploads. Chunked/streaming upload is a future improvement.

## Ideas for next

- Google OAuth to write events straight into your calendar (no click-through).
- Persist past lectures — a searchable course dashboard (Vercel Postgres/Blob).
- Live/real-time transcription with notes forming as the lecture happens.
- A running "everything due this week" view across all courses.
