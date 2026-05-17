"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import type { Channel } from "@singularity/db";

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
import { updateChannelInput } from "@/server/trpc/schemas/channels";

type Props = {
  channel: Channel;
};

export function EditChannelSheet({ channel }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(channel.name);
  const [platform, setPlatform] = useState<"youtube" | "xhs">(channel.platform);
  const [platformUrl, setPlatformUrl] = useState(channel.platformUrl);
  const [description, setDescription] = useState(channel.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = trpc.channels.update.useMutation({
    onSuccess: (updated) => {
      utils.channels.list.invalidate();
      utils.channels.bySlug.invalidate({ slug: updated.slug });
      toast.success(`Updated ${updated.name}`);
      setOpen(false);
      router.refresh();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const result = updateChannelInput.safeParse({
      id: channel.id,
      name,
      platform,
      platformUrl,
      description: description || null,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    updateMutation.mutate(result.data);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" />
        Edit
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit channel</SheetTitle>
          <SheetDescription>Slug stays the same — it&apos;s the URL identifier.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-platform">Platform</FieldLabel>
              <Select
                value={platform}
                onValueChange={(v) => setPlatform(v as "youtube" | "xhs")}
              >
                <SelectTrigger id="edit-platform">
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
              <FieldLabel htmlFor="edit-url">URL</FieldLabel>
              <Input
                id="edit-url"
                type="url"
                value={platformUrl}
                onChange={(e) => setPlatformUrl(e.target.value)}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                rows={4}
              />
            </Field>
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <SheetFooter className="mt-auto px-0">
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
