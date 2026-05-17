"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { createChannelInput } from "@/server/trpc/schemas/channels";

export function CreateChannelForm() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "xhs">("youtube");
  const [platformUrl, setPlatformUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.channels.create.useMutation({
    onSuccess: (channel) => {
      utils.channels.list.invalidate();
      toast.success(`已创建「${channel.name}」`);
      router.push("/channels");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const result = createChannelInput.safeParse({
      name,
      platform,
      platformUrl,
      description: description || null,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    createMutation.mutate(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">频道名称</FieldLabel>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：摄影老司机"
            required
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="platform">平台</FieldLabel>
          <Select value={platform} onValueChange={(v) => setPlatform(v as "youtube" | "xhs")}>
            <SelectTrigger id="platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="xhs">XHS (小红书)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="platformUrl">主页链接</FieldLabel>
          <Input
            id="platformUrl"
            type="url"
            value={platformUrl}
            onChange={(e) => setPlatformUrl(e.target.value)}
            placeholder={
              platform === "youtube"
                ? "https://www.youtube.com/@channel"
                : "https://www.xiaohongshu.com/user/profile/..."
            }
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">描述</FieldLabel>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="选填，频道定位、风格说明"
            rows={3}
          />
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "创建中…" : "创建频道"}
        </Button>
        <Button variant="ghost" type="button" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
