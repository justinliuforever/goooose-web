import { permanentRedirect } from "next/navigation";

// Poet is a per-project tool (§5); default project slug == account slug.
export default async function ProjectPoetRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = encodeURIComponent(slug);
  permanentRedirect(`/accounts/${s}/projects/${s}/poet`);
}
