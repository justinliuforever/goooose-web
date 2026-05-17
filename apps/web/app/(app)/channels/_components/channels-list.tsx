"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

import { DeleteChannelButton } from "./delete-channel-button";

function formatDate(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ChannelsList() {
  const { data, isLoading } = trpc.channels.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <Button render={<Link href="/channels/new" />} size="lg">
          <Plus data-icon="inline-start" />
          New channel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button render={<Link href="/channels/new" />} size="sm">
          <Plus data-icon="inline-start" />
          New channel
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((channel) => (
            <TableRow key={channel.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/channels/${encodeURIComponent(channel.slug)}`}
                  className="hover:text-foreground hover:underline"
                >
                  {channel.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                  {channel.platform}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                {channel.platformUrl}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatDate(channel.createdAt)}
              </TableCell>
              <TableCell>
                <DeleteChannelButton id={channel.id} name={channel.name} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
