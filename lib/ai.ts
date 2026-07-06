import { createGateway } from "ai";

/**
 * Per-request key resolution for the "bring your own keys" model.
 *
 * Each visitor supplies their own Deepgram and AI Gateway keys from the browser
 * Settings panel; the client sends them as request headers. We fall back to the
 * server env only for local development. Crucially we never construct a gateway
 * *without* an explicit key — that would silently fall back to the deployment's
 * OIDC credentials (i.e. the owner's money), which is exactly what we want to
 * avoid on the shared, public deployment.
 */

export const DEFAULT_ANALYSIS_MODEL =
  process.env.ANALYSIS_MODEL || "anthropic/claude-sonnet-5";

/** The caller's Deepgram key (header), falling back to server env for local dev. */
export function deepgramKey(req: Request): string {
  const key = req.headers.get("x-deepgram-key") || process.env.DEEPGRAM_API_KEY;
  if (!key) {
    throw new Error(
      "No transcription key. Open Settings and add your Deepgram API key, or paste a transcript instead."
    );
  }
  return key;
}

/**
 * Build a Gateway-backed model using the caller's own AI Gateway key (header),
 * falling back to the server env for local dev. Throws if neither is present so
 * we never spend the deployment owner's credits via OIDC.
 */
export function gatewayModel(req: Request, modelId: string = DEFAULT_ANALYSIS_MODEL) {
  const apiKey = req.headers.get("x-ai-gateway-key") || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No AI key. Open Settings and add your Vercel AI Gateway key to enable summaries, chat, and study aids."
    );
  }
  return createGateway({ apiKey })(modelId);
}
