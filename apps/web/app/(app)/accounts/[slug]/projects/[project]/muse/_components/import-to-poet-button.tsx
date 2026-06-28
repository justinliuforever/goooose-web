"use client";

import { Check, Loader2, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
  projectId: string;
  ideaId: string;
  topic: string;
  facts?: string | null;
  language: "en" | "zh";
  alreadyImported: boolean;
};

export function ImportToPoetButton({
  channelId,
  projectId,
  ideaId,
  topic,
  facts,
  language,
  alreadyImported,
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const create = trpc.poet.createCustomTopic.useMutation({
    onSuccess: () => {
      toast.success("已导入 Poet");
      utils.muse.importedIdeaIds.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`导入失败：${err.message}`),
  });

  if (alreadyImported) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Check className="size-3" />
        已导入 Poet
      </span>
    );
  }

  // createCustomTopicInput.topic requires min(5); a null/short story angle would 400 on import.
  const importable = topic.trim().length >= 5;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={create.isPending || !importable}
      onClick={() =>
        create.mutate({
          channelId,
          projectId,
          topic,
          references: facts ? [{ kind: "text", text: facts }] : [],
          language,
          sourceIdeaId: ideaId,
        })
      }
    >
      {create.isPending ? (
        <Loader2 data-icon="inline-start" className="animate-spin" />
      ) : (
        <FileText data-icon="inline-start" />
      )}
      导入 Poet
    </Button>
  );
}
