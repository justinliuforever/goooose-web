import { permanentRedirect } from "next/navigation";

export default async function ClerkVideoRedirect({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug, videoId } = await params;
  permanentRedirect(`/projects/${encodeURIComponent(slug)}/clerk/${encodeURIComponent(videoId)}`);
}
