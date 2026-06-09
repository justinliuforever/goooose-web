"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
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
  bibleId: string;
  bibleName: string;
  bibleContent: string;
};

export function BibleEditSheet({ bibleId, bibleName, bibleContent }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(bibleName);
  const [content, setContent] = useState(bibleContent);
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.poet.updateBible.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      utils.invalidate();
      router.refresh();
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ bibleId, name, content });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" />
        编辑
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>编辑圣经</SheetTitle>
          <SheetDescription>修改后立即生效，后续写稿都将使用新版本</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bible-edit-name">名称</FieldLabel>
              <Input
                id="bible-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="bible-edit-content">内容</FieldLabel>
              <Textarea
                id="bible-edit-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={24}
                className="font-mono text-xs"
              />
            </Field>
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <SheetFooter className="mt-auto px-0">
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "保存中…" : "保存"}
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
