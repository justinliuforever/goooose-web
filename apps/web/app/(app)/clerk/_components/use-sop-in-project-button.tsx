"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";

type Props = { sopId: string };

export function UseSopInProjectButton({ sopId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: projects, isLoading } = trpc.projects.listForPicker.useQuery(undefined, {
    enabled: open,
  });

  const setPrimary = trpc.sops.setPrimary.useMutation({
    onSuccess: () => {
      toast.success("已设为该项目写稿 SOP");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // Preserve account order from the query while bucketing projects per account.
  const groups: Array<{ accountName: string; projects: NonNullable<typeof projects> }> = [];
  for (const p of projects ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.accountName === p.accountName) last.projects.push(p);
    else groups.push({ accountName: p.accountName, projects: [p] });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>在项目中选用</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>在项目中选用</SheetTitle>
          <SheetDescription>选一个项目，把这份 SOP 设为它的写稿 SOP。</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有项目，先在账号下新建一个项目。</p>
          ) : (
            groups.map((g) => (
              <div key={g.accountName} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{g.accountName}</h3>
                <div className="flex flex-col gap-1.5">
                  {g.projects.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="justify-start"
                      disabled={setPrimary.isPending}
                      onClick={() => setPrimary.mutate({ projectId: p.id, sopId })}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
