import { getLogtoContext } from "@logto/next/server-actions";
import { NextResponse, type NextRequest } from "next/server";

import { logtoConfig } from "@/lib/logto";

export async function proxy(request: NextRequest) {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
    // Serve the public landing page on the apex URL itself (200, not a
    // redirect) — crawlers treating "homepage instantly demands login" as a
    // phishing signal is what got the fresh domain flagged.
    if (request.nextUrl.pathname === "/") {
      return NextResponse.rewrite(new URL("/landing", request.url));
    }
    return NextResponse.redirect(new URL("/api/auth/sign-in", request.url));
  }
}

export const config = {
  matcher: [
    "/",
    "/accounts/:path*",
    "/admin/:path*",
    "/channels/:path*",
    "/clerk/:path*",
    "/competitors/:path*",
    "/muse/:path*",
    "/poet/:path*",
    "/projects/:path*",
    "/request-access",
    "/sops/:path*",
    "/usage",
  ],
};
