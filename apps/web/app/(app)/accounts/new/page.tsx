import { BackLink } from "@/components/back-link";

import { CreateChannelForm } from "../_components/create-channel-form";

export default function NewChannelPage() {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
      <BackLink href="/accounts" label="账号" />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">新建账号</h1>
      </header>
      <CreateChannelForm />
    </div>
  );
}
