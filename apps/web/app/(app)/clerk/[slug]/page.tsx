import { permanentRedirect } from "next/navigation";

// Back-compat: tools moved under /projects/[slug]/. 308 to the new route.
export default async function ClerkSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/projects/${encodeURIComponent(slug)}/clerk`);
}
