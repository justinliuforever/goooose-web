import { handleSignIn } from "@logto/next/server-actions";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";

import { loginEvents, users } from "@singularity/db";

import { db } from "@/lib/db";
import { logtoConfig } from "@/lib/logto";
import { ensureCurrentUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  await handleSignIn(logtoConfig, request.nextUrl.searchParams);
  // One row per completed sign-in — feeds the admin user-detail view. Never
  // block the login redirect on bookkeeping.
  try {
    const user = await ensureCurrentUser();
    if (user) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip");
      await db.insert(loginEvents).values({
        userId: user.id,
        ip: ip || null,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      });
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
    }
  } catch (err) {
    console.error("login event bookkeeping failed", err);
  }
  redirect("/welcome");
}
