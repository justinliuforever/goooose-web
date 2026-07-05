"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  blocked: "已停用",
};

function statusBadge(status: string) {
  const variant =
    status === "approved" ? "success" : status === "pending" ? "secondary" : "destructive";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function AdminPanel() {
  const utils = trpc.useUtils();
  const requests = trpc.admin.listRequests.useQuery();
  const allowed = trpc.admin.listAllowedEmails.useQuery();
  const usersQuery = trpc.admin.listUsers.useQuery();

  const decide = trpc.admin.decideRequest.useMutation({
    onSuccess: (res, vars) => {
      if (vars.decision === "approve") {
        toast.success(
          res.emailSent ? "已批准，通知邮件已发送" : "已批准（邮件未配置，请人工通知对方）",
        );
      } else {
        toast.success("已拒绝");
      }
      void utils.admin.listRequests.invalidate();
      void utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const addAllowed = trpc.admin.addAllowedEmail.useMutation({
    onSuccess: () => {
      toast.success("已加入预邀请名单");
      setInviteEmail("");
      void utils.admin.listAllowedEmails.invalidate();
      void utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeAllowed = trpc.admin.removeAllowedEmail.useMutation({
    onSuccess: () => void utils.admin.listAllowedEmails.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const setAccess = trpc.admin.setUserAccess.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      void utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>内测申请</CardTitle>
          <CardDescription>批准后对方即可使用（配置邮件后会自动通知）</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申请人</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead>联系方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{r.displayName ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-pre-wrap text-sm">
                      {r.message}
                    </TableCell>
                    <TableCell className="text-sm">{r.contact ?? "—"}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ requestId: r.id, decision: "approve" })}
                          >
                            批准
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ requestId: r.id, decision: "reject" })}
                          >
                            拒绝
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {requests.isLoading ? "加载中…" : "暂无申请"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>预邀请邮箱</CardTitle>
          <CardDescription>名单内的邮箱登录后自动获得内测资格</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="someone@example.com"
              className="max-w-sm"
            />
            <Button
              disabled={addAllowed.isPending || !inviteEmail.includes("@")}
              onClick={() => addAllowed.mutate({ email: inviteEmail })}
            >
              添加
            </Button>
          </div>
          {allowed.data?.length ? (
            <div className="flex flex-wrap gap-2">
              {allowed.data.map((a) => (
                <Badge key={a.email} variant="secondary" className="gap-1">
                  {a.email}
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => removeAllowed.mutate({ email: a.email })}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户</CardTitle>
          <CardDescription>全部注册用户与访问状态</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{u.displayName ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(u.accessStatus)}</TableCell>
                  <TableCell className="text-sm">{u.role === "admin" ? "管理员" : "成员"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {u.accessStatus !== "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setAccess.isPending}
                          onClick={() => setAccess.mutate({ userId: u.id, accessStatus: "approved" })}
                        >
                          放行
                        </Button>
                      ) : null}
                      {u.accessStatus !== "blocked" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setAccess.isPending}
                          onClick={() => setAccess.mutate({ userId: u.id, accessStatus: "blocked" })}
                        >
                          停用
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
