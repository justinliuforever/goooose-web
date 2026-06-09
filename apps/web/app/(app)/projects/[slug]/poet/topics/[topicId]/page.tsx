import { permanentRedirect } from "next/navigation";

export default async function ProjectTopicRedirect({
  params,
}: {
  params: Promise<{ slug: string; topicId: string }>;
}) {
  const { slug, topicId } = await params;
  const s = encodeURIComponent(slug);
  permanentRedirect(`/accounts/${s}/projects/${s}/poet/topics/${encodeURIComponent(topicId)}`);
}
