"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type RefDraft = {
  kind: "youtube" | "xhs" | "text";
  url?: string;
  text?: string;
  title?: string;
};

type Props = {
  channelId: string;
  hasActiveBible: boolean;
};

const KIND_LABEL: Record<RefDraft["kind"], string> = {
  youtube: "YouTube 链接",
  xhs: "小红书链接",
  text: "粘贴文本",
};

export function CustomTopicCreateSheet({ channelId, hasActiveBible }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [refs, setRefs] = useState<RefDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.poet.createCustomTopic.useMutation({
    onSuccess: () => {
      toast.success("已新建自定义选题");
      utils.invalidate();
      router.refresh();
      setOpen(false);
      setTopic("");
      setRefs([]);
    },
    onError: (err) => setError(err.message),
  });

  function addRef(kind: RefDraft["kind"]) {
    setRefs((prev) => [...prev, { kind }]);
  }

  function updateRef(i: number, patch: Partial<RefDraft>) {
    setRefs((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRef(i: number) {
    setRefs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (topic.trim().length < 5) {
      setError("选题描述至少 5 个字");
      return;
    }
    const cleaned = refs.filter((r) => {
      if (r.kind === "text") return (r.text ?? "").trim().length > 0;
      return (r.url ?? "").trim().length > 0;
    });
    create.mutate({
      channelId,
      topic: topic.trim(),
      references: cleaned,
      language: "zh",
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" disabled={!hasActiveBible} />}>
        <Plus data-icon="inline-start" />
        新建自定义选题
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>新建自定义选题</SheetTitle>
          <SheetDescription>
            描述你想写的主题，可附加 YouTube / 小红书链接或粘贴文本作为素材。提交后点「分析」让 AI 拆解。
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="topic-text">选题描述</FieldLabel>
              <Textarea
                id="topic-text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：拍婚礼前一定要知道的 7 件事——为什么 80% 的新人最后都后悔了"
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                越具体越好；AI 会从这里提炼故事角度、事实数据、爆款触发等结构化字段
              </p>
            </Field>

            <Field>
              <FieldLabel>外部素材（可选）</FieldLabel>
              <div className="flex flex-col gap-3">
                {refs.map((r, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Select
                        value={r.kind}
                        onValueChange={(v) =>
                          updateRef(i, { kind: v as RefDraft["kind"] })
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="youtube">{KIND_LABEL.youtube}</SelectItem>
                            <SelectItem value="xhs">{KIND_LABEL.xhs}</SelectItem>
                            <SelectItem value="text">{KIND_LABEL.text}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRef(i)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                    {r.kind === "text" ? (
                      <Textarea
                        value={r.text ?? ""}
                        onChange={(e) => updateRef(i, { text: e.target.value })}
                        placeholder="粘贴文本内容"
                        rows={3}
                      />
                    ) : (
                      <Input
                        type="url"
                        value={r.url ?? ""}
                        onChange={(e) => updateRef(i, { url: e.target.value })}
                        placeholder={
                          r.kind === "youtube"
                            ? "https://www.youtube.com/watch?v=..."
                            : "https://www.xiaohongshu.com/explore/..."
                        }
                      />
                    )}
                    <Input
                      value={r.title ?? ""}
                      onChange={(e) => updateRef(i, { title: e.target.value })}
                      placeholder="标题（可选）"
                    />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRef("youtube")}
                    disabled={refs.length >= 10}
                  >
                    + YouTube
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRef("xhs")}
                    disabled={refs.length >= 10}
                  >
                    + 小红书
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRef("text")}
                    disabled={refs.length >= 10}
                  >
                    + 文本
                  </Button>
                </div>
              </div>
            </Field>
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <SheetFooter className="mt-auto px-0">
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "新建中…" : "保存"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={create.isPending}
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
