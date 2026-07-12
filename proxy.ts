import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Clerk is the login wall (Next 16 "proxy" = the renamed middleware convention,
 * Node.js runtime by default). Following Clerk's resource-based guidance:
 *  - API routes are NOT gated here — each protected route calls `auth()` itself
 *    (see process / chat / study / blob-upload), which is the real security
 *    boundary for anything that spends the server keys.
 *  - Page visits by a signed-out user are redirected to sign-in (UX only).
 * `clerkMiddleware()` still needs to run so `auth()` works inside routes/pages.
 */
export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  const isAuthPage =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isApi = pathname.startsWith("/api");
  if (isAuthPage || isApi) return; // public pages + self-protecting API routes

  const { userId } = await auth();
  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static assets unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|map)).*)",
    // Always run for API routes and Clerk's handshake path.
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
