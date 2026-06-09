import { permanentRedirect } from "next/navigation";

// Clerk is a global analysis engine (§5). 308 to the canonical /clerk/[slug].
export default async function ProjectClerkRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/clerk/${encodeURIComponent(slug)}`);
}
