import { permanentRedirect } from "next/navigation";

// Muse is a per-project tool (§5). 308 to the canonical nested URL (default project slug == account slug).
export default async function ProjectMuseRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = encodeURIComponent(slug);
  permanentRedirect(`/accounts/${s}/projects/${s}/muse`);
}
