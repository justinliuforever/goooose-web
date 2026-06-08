import { permanentRedirect } from "next/navigation";

export default async function PoetSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/projects/${encodeURIComponent(slug)}/poet`);
}
