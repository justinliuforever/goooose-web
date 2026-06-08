import { permanentRedirect } from "next/navigation";

export default async function MuseSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/projects/${encodeURIComponent(slug)}/muse`);
}
