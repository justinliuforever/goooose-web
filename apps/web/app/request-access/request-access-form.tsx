"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export function RequestAccessForm({ email, blocked }: { email: string; blocked: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [betaCode, setBetaCode] = useState("");
  const status = trpc.access.status.useQuery(undefined, { enabled: !blocked });
  const submit = trpc.access.submit.useMutation({
    onSuccess: () => {
      toast.success("申请已提交，审核通过后即可使用");
      void status.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const redeemCode = trpc.access.redeemBetaCode.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.minutesGranted > 0 ? `内测码已激活，附赠 ${r.minutesGranted} 分钟` : "内测码已激活",
      );
      router.push("/");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (blocked) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>访问已停用</CardTitle>
          <CardDescription>
            账号 {email} 的访问权限已被停用，如有疑问请联系团队。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pendingRequest = status.data?.latestRequest?.status === "pending";
  const rejected = status.data?.latestRequest?.status === "rejected";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
    <Card className="w-full">
      <CardHeader>
        <CardTitle>申请内测资格</CardTitle>
        <CardDescription>
          搬砖小鹅 Goooose 正在封闭内测。当前登录邮箱 {email}
          {pendingRequest
            ? "，你的申请正在审核中，通过后即可使用。"
            : " 尚未获得内测资格，提交申请后我们会尽快审核。"}
        </CardDescription>
      </CardHeader>
      {pendingRequest ? (
        <CardFooter className="text-sm text-muted-foreground">
          审核通过后此页面会自动放行，也可以留意邮件通知。
        </CardFooter>
      ) : (
        <>
          <CardContent className="flex flex-col gap-4">
            {rejected ? (
              <p className="text-sm text-muted-foreground">
                上一次申请未通过，可以补充说明后重新提交。
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="request-message">想用搬砖小鹅做什么？</Label>
              <Textarea
                id="request-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="例如：运营小红书美护账号，想用对标拆解和写稿功能"
                rows={4}
                maxLength={2000}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="request-contact">联系方式（选填，微信/手机号）</Label>
              <Input
                id="request-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="方便我们审核通过后联系你"
                maxLength={200}
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button
              onClick={() => submit.mutate({ message, contact: contact || undefined })}
              disabled={submit.isPending || message.trim().length === 0}
              className="w-full"
            >
              {submit.isPending ? "提交中…" : "提交申请"}
            </Button>
            {message.trim().length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                填写使用场景后即可提交
              </p>
            ) : null}
          </CardFooter>
        </>
      )}
    </Card>

    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">已有内测码？</CardTitle>
        <CardDescription>输入内测码即刻开通，无需等待审核。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
            placeholder="SING-XXXX-XXXX"
            className="font-mono"
            maxLength={32}
          />
          <Button
            onClick={() => redeemCode.mutate({ code: betaCode })}
            disabled={redeemCode.isPending || betaCode.trim().length < 4}
          >
            {redeemCode.isPending ? "激活中…" : "激活"}
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
