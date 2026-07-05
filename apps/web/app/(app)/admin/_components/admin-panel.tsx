"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

const ROLE_LABEL: Record<string, string> = {
  member: "成员",
  admin: "管理员",
};

const MINUTE_PRESETS = [50, 100, 300, 600];

function statusBadge(status: string) {
  const variant =
    status === "approved" ? "success" : status === "pending" ? "secondary" : "destructive";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function UserDetailSheet({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const detail = trpc.admin.userDetail.useQuery(
    { userId: userId ?? "" },
    { enabled: !!userId },
  );
  const d = detail.data;
  return (
    <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{d?.user.displayName ?? d?.user.email ?? "用户详情"}</SheetTitle>
          <SheetDescription>{d?.user.email}</SheetDescription>
        </SheetHeader>
        {d ? (
          <div className="flex flex-col gap-5 px-4 pb-8 text-sm">
            <div className="flex flex-wrap gap-2">
              {statusBadge(d.user.accessStatus)}
              <Badge variant="outline">{d.user.role === "admin" ? "管理员" : "成员"}</Badge>
              <Badge variant="outline">{d.user.plan}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <span className="text-muted-foreground">注册时间</span>
              <span>{new Date(d.user.createdAt).toLocaleString("zh-CN")}</span>
              <span className="text-muted-foreground">最近登录</span>
              <span>
                {d.user.lastSeenAt ? new Date(d.user.lastSeenAt).toLocaleString("zh-CN") : "—"}
              </span>
              <span className="text-muted-foreground">登录次数</span>
              <span>{d.loginCount}</span>
              <span className="text-muted-foreground">任务次数</span>
              <span>{d.runCount}</span>
              <span className="text-muted-foreground">本月时长</span>
              <span className="font-mono">
                {d.minutes.used} / {d.minutes.base}
                {d.minutes.bonus > 0 ? ` +${d.minutes.bonus}` : ""} 分钟
              </span>
            </div>

            {d.latestRequest ? (
              <div className="flex flex-col gap-1 rounded-md border p-3">
                <span className="text-xs text-muted-foreground">
                  内测申请（{STATUS_LABEL[d.latestRequest.status] ?? d.latestRequest.status}）
                </span>
                <p className="whitespace-pre-wrap">{d.latestRequest.message}</p>
                {d.latestRequest.contact ? (
                  <span className="text-xs text-muted-foreground">
                    联系方式：{d.latestRequest.contact}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <span className="font-medium">用量（近 6 个月）</span>
              {d.usageByMonth.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月份</TableHead>
                      <TableHead className="text-right">tokens 入/出</TableHead>
                      <TableHead className="text-right">ASR 分</TableHead>
                      <TableHead className="text-right">成本</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.usageByMonth.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-mono text-xs">{row.month}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {Number(row.llmInputTokens).toLocaleString()}/
                          {Number(row.llmOutputTokens).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {(Number(row.asrSeconds) / 60).toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ${Number(row.costUsd).toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-xs text-muted-foreground">暂无用量记录</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-medium">最近登录（10 次）</span>
              {d.logins.length ? (
                <div className="flex flex-col gap-1.5">
                  {d.logins.map((l, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString("zh-CN")}
                      </span>
                      <span className="font-mono">{l.ip ?? "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  暂无记录（登录跟踪自本版本上线起生效）
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">加载中…</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AdminPanel({ selfId }: { selfId: string }) {
  const utils = trpc.useUtils();
  const requests = trpc.admin.listRequests.useQuery();
  const allowed = trpc.admin.listAllowedEmails.useQuery();
  const usersQuery = trpc.admin.listUsers.useQuery();
  const usage = trpc.admin.usageSummary.useQuery();
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

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
    onSuccess: (res) => {
      toast.success(
        res.approved > 0 ? "已加入名单并放行该用户" : "已加入预邀请名单",
      );
      setInviteEmail("");
      void utils.admin.listAllowedEmails.invalidate();
      void utils.admin.listUsers.invalidate();
      void utils.admin.listRequests.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeAllowed = trpc.admin.removeAllowedEmail.useMutation({
    onSuccess: () => void utils.admin.listAllowedEmails.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const setAccess = trpc.admin.setUserAccess.useMutation({
    onSuccess: (res, vars) => {
      if (vars.accessStatus === "approved") {
        toast.success(
          res.emailSent ? "已通过，通知邮件已发送" : "已通过（邮件未配置，请人工通知对方）",
        );
      } else {
        toast.success("已更新");
      }
      void utils.admin.listUsers.invalidate();
      void utils.admin.listRequests.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const setRole = trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("角色已更新");
      void utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("用户已删除");
      void utils.admin.listUsers.invalidate();
      void utils.admin.listRequests.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const codes = trpc.admin.listCodes.useQuery();
  const [codeMinutes, setCodeMinutes] = useState("100");
  const createCode = trpc.admin.createCode.useMutation({
    onSuccess: (created) => {
      toast.success(`已生成：${created.code}（${created.grant?.minutes ?? 0} 分钟）`);
      void utils.admin.listCodes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const disableCode = trpc.admin.disableCode.useMutation({
    onSuccess: () => void utils.admin.listCodes.invalidate(),
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && inviteEmail.includes("@") && !addAllowed.isPending) {
                  addAllowed.mutate({ email: inviteEmail });
                }
              }}
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
          <CardTitle>时长兑换码</CardTitle>
          <CardDescription>
            生成后发给用户，在「用量与额度」页兑换；加到对方当月额度，本月有效
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {MINUTE_PRESETS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={codeMinutes === String(p) ? "default" : "outline"}
                onClick={() => setCodeMinutes(String(p))}
              >
                {p} 分钟
              </Button>
            ))}
            <Input
              value={codeMinutes}
              onChange={(e) => setCodeMinutes(e.target.value.replace(/\D/g, ""))}
              className="w-24 font-mono"
              placeholder="自定义"
            />
            <Button
              disabled={createCode.isPending || !Number(codeMinutes)}
              onClick={() => createCode.mutate({ minutes: Number(codeMinutes) })}
            >
              生成兑换码
            </Button>
          </div>
          {codes.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>码</TableHead>
                  <TableHead>时长</TableHead>
                  <TableHead>使用</TableHead>
                  <TableHead>使用者</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.data.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                  const exhausted = c.usedCount >= c.maxUses;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-xs hover:underline"
                          title="点击复制"
                          onClick={() => {
                            void navigator.clipboard.writeText(c.code);
                            toast.success(`已复制 ${c.code}`);
                          }}
                        >
                          {c.code}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">{c.grant?.minutes ?? 0} 分钟</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.usedCount}/{c.maxUses}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.redeemers.length ? (
                          <div className="flex flex-col gap-0.5">
                            {c.redeemers.map((r, i) => (
                              <span key={i} title={new Date(r.redeemedAt).toLocaleString("zh-CN")}>
                                {r.email}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="destructive">已失效</Badge>
                        ) : exhausted ? (
                          <Badge variant="secondary">已用完</Badge>
                        ) : (
                          <Badge variant="success">可用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!expired && !exhausted ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disableCode.isPending}
                            onClick={() => disableCode.mutate({ codeId: c.id })}
                          >
                            作废
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户</CardTitle>
          <CardDescription>状态与角色可直接切换；点击「详情」查看用量、登录记录与申请信息</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="text-right">本月时长</TableHead>
                <TableHead>最近登录</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>
                          {u.displayName ?? "—"}
                          {isSelf ? (
                            <span className="ml-1 text-xs text-muted-foreground">(我)</span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        statusBadge(u.accessStatus)
                      ) : (
                        <Select
                          value={u.accessStatus}
                          onValueChange={(v) =>
                            setAccess.mutate({
                              userId: u.id,
                              accessStatus: v as "pending" | "approved" | "blocked",
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="w-28">
                            {STATUS_LABEL[u.accessStatus] ?? u.accessStatus}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved">已通过</SelectItem>
                            <SelectItem value="pending">待审核</SelectItem>
                            <SelectItem value="blocked">已停用</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        <span className="text-sm">管理员</span>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(v) =>
                            setRole.mutate({ userId: u.id, role: v as "member" | "admin" })
                          }
                        >
                          <SelectTrigger size="sm" className="w-28">
                            {ROLE_LABEL[u.role] ?? u.role}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">成员</SelectItem>
                            <SelectItem value="admin">管理员</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(u.minutesUsed)}
                      {Number(u.bonusMinutes) > 0 ? ` (+${Number(u.bonusMinutes)})` : ""} 分
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("zh-CN") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setDetailUserId(u.id)}>
                          详情
                        </Button>
                        {!isSelf ? (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={deleteUser.isPending}
                                />
                              }
                            >
                              删除
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除用户 {u.email}？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  将永久删除该用户及其全部账号、项目、分析、SOP、圣经、选题与脚本，不可恢复。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteUser.mutate({ userId: u.id })}>
                                  确认删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用量</CardTitle>
          <CardDescription>按用户按月的资源消耗与估算成本（内部遥测）</CardDescription>
        </CardHeader>
        <CardContent>
          {usage.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月份</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead className="text-right">LLM tokens</TableHead>
                  <TableHead className="text-right">ASR 分钟</TableHead>
                  <TableHead className="text-right">抓取调用</TableHead>
                  <TableHead className="text-right">估算成本</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.data.map((row) => (
                  <TableRow key={`${row.month}-${row.userId}`}>
                    <TableCell className="font-mono text-xs">{row.month}</TableCell>
                    <TableCell className="text-sm">{row.email}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(row.llmTokens).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {(Number(row.asrSeconds) / 60).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(row.scrapeCalls).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${Number(row.costUsd).toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {usage.isLoading ? "加载中…" : "暂无用量数据（新任务运行后开始记录）"}
            </p>
          )}
        </CardContent>
      </Card>

      <UserDetailSheet userId={detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}
