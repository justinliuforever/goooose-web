import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { channels, clerkVideos } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { ensureCurrentUser } from "@/lib/users";

import { ClerkRunButton } from "./_components/clerk-run-button";

type Props = { params: Promise<{ slug: string }> };

function formatViews(views: number | null): string {
  if (views == null) return "—";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function ClerkChannelPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const user = await ensureCurrentUser();
  if (!user) return null;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel || channel.userId !== user.id) {
    notFound();
  }

  const videos = await db
    .select()
    .from(clerkVideos)
    .where(eq(clerkVideos.channelId, channel.id))
    .orderBy(desc(clerkVideos.views));

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/clerk" />}
        className="w-fit text-muted-foreground"
      >
        <ChevronLeft data-icon="inline-start" />
        Clerk
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-clerk" />
          <h1 className="text-2xl font-semibold tracking-tight">{channel.name}</h1>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {videos.length} videos
          </Badge>
        </div>
        <ClerkRunButton channelId={channel.id} channelName={channel.name} />
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Hook</TableHead>
            <TableHead className="w-20">Views</TableHead>
            <TableHead className="w-20">Length</TableHead>
            <TableHead className="w-28">Analyzed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="max-w-md truncate font-medium">
                <Link
                  href={`/clerk/${encodeURIComponent(slug)}/${encodeURIComponent(v.platformVideoId)}`}
                  className="hover:text-foreground hover:underline"
                >
                  {v.title}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.openingHookType ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatViews(v.views)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDuration(v.durationSec)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.analyzedAt ? v.analyzedAt.toLocaleDateString("zh-CN") : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
