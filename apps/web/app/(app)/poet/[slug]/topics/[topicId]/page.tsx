import { permanentRedirect } from "next/navigation";

export default async function PoetTopicRedirect({
  params,
}: {
  params: Promise<{ slug: string; topicId: string }>;
}) {
  const { slug, topicId } = await params;
  permanentRedirect(`/accounts/${encodeURIComponent(slug)}/projects/${encodeURIComponent(slug)}/poet/topics/${encodeURIComponent(topicId)}`);
}
