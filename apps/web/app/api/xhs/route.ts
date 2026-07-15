import { NextResponse } from "next/server";

import { createUsageSink } from "@goooose/db";
import { buildXhsNoteUrl, getXhsNoteXsecToken } from "@goooose/integrations/clients/xhs";
import { runWithUsage } from "@goooose/integrations/metering";

import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

const NOTE_ID = /^[a-f0-9]{16,32}$/i;
const usageSink = createUsageSink(db);

// xsec_tokens outlive this by a wide margin, so a short cache keeps click-through fresh
// while cutting the paid TikHub call on repeat clicks (and bounding a hammering loop).
const CACHE_TTL_MS = 30 * 60_000;
const tokenCache = new Map<string, { token: string; exp: number }>();

// Lazy xsec_token resolver. Web XHS blocks tokenless note URLs and share tokens expire, so
// instead of baking a token into the stored URL at analysis time we fetch a fresh one at
// click time and 302 to the note. Gated like protectedProcedure (approved beta users only)
// and metered, since it spends the shared TikHub key. On failure we still 302 to the bare
// URL (no worse than before).
export async function GET(request: Request): Promise<NextResponse> {
  const noteId = new URL(request.url).searchParams.get("note") ?? "";
  if (!NOTE_ID.test(noteId)) return new NextResponse("invalid note id", { status: 400 });

  const user = await ensureCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/api/auth/sign-in", request.url));
  if (user.accessStatus !== "approved") {
    return NextResponse.redirect(new URL("/request-access", request.url));
  }

  const now = Date.now();
  const cached = tokenCache.get(noteId);
  if (cached && cached.exp > now) {
    return NextResponse.redirect(buildXhsNoteUrl(noteId, cached.token));
  }

  try {
    const token = await runWithUsage(
      { userId: user.id, feature: "web", sink: usageSink },
      () => getXhsNoteXsecToken(noteId),
    );
    if (token) {
      if (tokenCache.size > 2000) tokenCache.clear();
      tokenCache.set(noteId, { token, exp: now + CACHE_TTL_MS });
    }
    return NextResponse.redirect(buildXhsNoteUrl(noteId, token));
  } catch {
    return NextResponse.redirect(buildXhsNoteUrl(noteId));
  }
}
