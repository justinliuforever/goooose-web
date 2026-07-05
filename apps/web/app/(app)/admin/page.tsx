import { notFound } from "next/navigation";

import { ensureCurrentUser } from "@/lib/users";

import { AdminPanel } from "./_components/admin-panel";

export default async function AdminPage() {
  const user = await ensureCurrentUser();
  if (!user || user.role !== "admin") notFound();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">管理后台</h1>
        <p className="text-sm text-muted-foreground">内测准入审批与用户管理</p>
      </div>
      <AdminPanel />
    </div>
  );
}
