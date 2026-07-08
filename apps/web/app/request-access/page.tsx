import { signOut } from "@logto/next/server-actions";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logtoConfig } from "@/lib/logto";
import { ensureCurrentUser } from "@/lib/users";
import { APP_VERSION_LABEL } from "@/lib/version";

import { RequestAccessForm } from "./request-access-form";

export default async function RequestAccessPage() {
  const user = await ensureCurrentUser();
  if (!user) redirect("/api/auth/sign-in");
  if (user.accessStatus === "approved") redirect("/");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-brand text-3xl leading-none">
          搬砖小鹅 <span className="font-display italic">Goooose</span>
        </span>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {APP_VERSION_LABEL}
        </span>
      </div>
      <RequestAccessForm
        email={user.email}
        blocked={user.accessStatus === "blocked"}
      />
      <form
        action={async () => {
          "use server";
          await signOut(logtoConfig, new URL("/signed-out", logtoConfig.baseUrl).toString());
        }}
      >
        <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
          退出登录 / 换个邮箱
        </Button>
      </form>
    </div>
  );
}
