import { getLogtoContext } from "@logto/next/server-actions";
import { NextResponse, type NextRequest } from "next/server";

import { logtoConfig } from "@/lib/logto";

export async function proxy(request: NextRequest) {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  if (!isAuthenticated) {
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
