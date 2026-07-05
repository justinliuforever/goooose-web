import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_VERSION_LABEL } from "@/lib/version";

export default function SignedOutPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-display text-5xl leading-none tracking-tight">已退出登录</h1>
      <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        {APP_VERSION_LABEL}
      </span>
      <Button render={<Link href="/api/auth/sign-in" />} size="lg">
        重新登录
      </Button>
    </div>
  );
}
