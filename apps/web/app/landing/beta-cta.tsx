"use client";

import { ArrowRight, Ticket } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

// Swap for the real Tencent Survey link before launch (one-line change).
const BETA_SURVEY_URL = "https://wj.qq.com/";

// Must match BETA_CODE_COOKIE in server/access-code.ts (client file can't import server-only).
const CODE_COOKIE = "goooose_beta_code";

const REASON_LABELS: Record<string, string> = {
  not_found: "内测码不存在，请检查输入",
  not_access: "这是时长兑换码，不是内测码",
  expired: "内测码已过期",
  exhausted: "内测码已被用完",
};

export function BetaCta() {
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validate = trpc.access.validateBetaCode.useMutation({
    onSuccess: (r) => {
      if (!r.valid) {
        setError(REASON_LABELS[r.reason ?? ""] ?? "内测码无效");
        return;
      }
      // Stash for the login callback to auto-redeem; Lax survives the Logto top-level redirect.
      document.cookie = `${CODE_COOKIE}=${encodeURIComponent(code.trim().toUpperCase())}; path=/; max-age=1800; SameSite=Lax`;
      window.location.href = "/api/auth/sign-in";
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button render={<a href={BETA_SURVEY_URL} target="_blank" rel="noopener noreferrer" />} size="lg">
          申请内测
          <ArrowRight data-icon="inline-end" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            setCodeOpen((v) => !v);
            setError(null);
          }}
        >
          <Ticket data-icon="inline-start" />
          我有内测码
        </Button>
      </div>

      {codeOpen ? (
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex w-full gap-2">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim().length >= 4 && !validate.isPending) {
                  validate.mutate({ code });
                }
              }}
              placeholder="SING-XXXX-XXXX"
              className="bg-background text-center font-mono tracking-wider"
              maxLength={32}
              autoFocus
            />
            <Button
              onClick={() => validate.mutate({ code })}
              disabled={validate.isPending || code.trim().length < 4}
            >
              {validate.isPending ? "验证中…" : "验证并登录"}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        填写申请问卷，通过后内测码会发到你的邮箱 · 已获准入的邮箱可直接登录
      </p>
    </div>
  );
}
