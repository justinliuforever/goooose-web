"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
  channelName: string;
  channelDescription: string | null;
  buttonLabel: string;
  buttonVariant?: "default" | "outline";
};

export function BibleGenerateSheet({
  channelId,
  channelName,
  channelDescription,
  buttonLabel,
  buttonVariant = "default",
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ideaText, setIdeaText] = useState(channelDescription ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.poet.generateBible.useMutation({
    onSuccess: () => {
      toast.info(`已开始为「${channelName}」生成频道圣经`);
      utils.invalidate();
      router.refresh();
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (ideaText.trim().length < 20) {
      setError("请用至少 20 个字描述这个频道想做什么");
      return;
    }
    mutation.mutate({
      channelId,
      ideaText: ideaText.trim(),
      name: name.trim() || undefined,
      language: "zh",
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant={buttonVariant} size="sm" />}>
        <Sparkles data-icon="inline-start" />
        {buttonLabel}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>生成频道圣经</SheetTitle>
          <SheetDescription>
            描述你想做什么样的频道，AI 会生成一份策略简报作为后续写稿的依据
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bible-name">名称（可选）</FieldLabel>
              <Input
                id="bible-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="留空将使用 AI 提取的话题"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="bible-idea">频道想法</FieldLabel>
              <Textarea
                id="bible-idea"
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="例如：面向小红书的露营装备频道，主打实测体验与避坑指南"
                rows={8}
                required
              />
              <p className="text-xs text-muted-foreground">
                越具体越好。如果填得太泛，AI 可能「偏题」——系统会自动检测并提示
              </p>
            </Field>
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <SheetFooter className="mt-auto px-0">
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                {mutation.isPending ? "提交中…" : "开始生成"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                取消
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
