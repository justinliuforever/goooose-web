import { permanentRedirect } from "next/navigation";

// Clerk is a global analysis engine (§5), so this leaves the project namespace.
export default async function ProjectClerkVideoRedirect({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug, videoId } = await params;
  permanentRedirect(`/clerk/${encodeURIComponent(slug)}/${encodeURIComponent(videoId)}`);
}
