"use client";

import { motion } from "framer-motion";
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
  // Optimistic flip — visual feedback before router.refresh() completes its round-trip.
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

  // Keyed remount springs the label when the state flips — confirms the optimistic toggle landed.
  if (effective) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => toggle(false)}
      >
        <motion.span
          key="approved"
          initial={{ scale: 0.7, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          已通过
        </motion.span>
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(true)}>
      <motion.span
        key="unapproved"
        initial={{ scale: 0.7, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
        className="flex items-center gap-1.5"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
        待审批
      </motion.span>
    </Button>
  );
}
