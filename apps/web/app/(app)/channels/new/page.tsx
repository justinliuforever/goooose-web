import { CreateChannelForm } from "../_components/create-channel-form";

export default function NewChannelPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">新建频道</h1>
      </header>
      <CreateChannelForm />
    </div>
  );
}
