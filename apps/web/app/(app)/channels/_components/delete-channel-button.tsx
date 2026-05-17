"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  id: string;
  name: string;
};

export function DeleteChannelButton({ id, name }: Props) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.channels.delete.useMutation({
    onSuccess: () => {
      utils.channels.list.invalidate();
      toast.success(`已删除「${name}」`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`删除 ${name}`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除频道？</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{name}</span> 及其所有分析记录、选题、脚本将被永久删除，无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id })}
            disabled={deleteMutation.isPending}
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
