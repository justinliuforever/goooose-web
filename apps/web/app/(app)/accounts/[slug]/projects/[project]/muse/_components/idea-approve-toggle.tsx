"use client";

import { Check, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  ideaId: string;
  approved: boolean;
  scripted: boolean;
};

export function IdeaApproveToggle({ ideaId, approved, scripted }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Optimistic local state — flip immediately on click so the user gets visual
  // feedback before router.refresh() completes its server round-trip.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const effective = optimistic ?? approved;

  const mutation = trpc.muse.approveIdea.useMutation({
    onSuccess: () => router.refresh(),
    onError: (err) => {
      setOptimistic(null);
      toast.error(`保存失败：${err.message}`);
    },
    onSettled: () => setPending(false),
  });

  const toggle = (next: boolean) => {
    setOptimistic(next);
    setPending(true);
    mutation.mutate({ ideaId, approved: next });
  };

  if (scripted) {
    return <span className="text-[10px] text-muted-foreground">已写稿</span>;
  }

  if (effective) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => toggle(false)}
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        已通过
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(true)}>
      {pending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
      待审批
    </Button>
  );
}
