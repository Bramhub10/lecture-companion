import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Mints short-lived client tokens so the browser can upload lecture audio
 * DIRECTLY to Vercel Blob — bypassing the 4.5 MB serverless request-body limit
 * that was rejecting full-length recordings. The audio never passes through this
 * function; only the resulting Blob URL is later sent to /api/process.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Whatever the browser's MediaRecorder produces, plus common uploads.
        allowedContentTypes: [
          "audio/webm",
          "audio/ogg",
          "audio/mp4",
          "audio/mpeg",
          "audio/wav",
          "audio/x-wav",
          "audio/aac",
          "audio/flac",
          "video/webm",
          "video/mp4",
        ],
        addRandomSuffix: true, // unguessable URL per recording
        maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB — a very long lecture
      }),
      // Fires server-side once the upload finishes. We don't need to persist
      // anything here (the client gets the URL back directly), so it's a no-op.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload authorization failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
