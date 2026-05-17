import { ChannelsList } from "./_components/channels-list";

export default function ChannelsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">频道</h1>
      </header>
      <ChannelsList />
    </div>
  );
}
