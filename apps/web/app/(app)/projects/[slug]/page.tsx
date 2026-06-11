import { permanentRedirect } from "next/navigation";

// §5: project hubs live under /accounts/[slug]/projects/[project]; bare /projects/[slug] 308s to the account hub.
export default async function ProjectHubRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/accounts/${encodeURIComponent(slug)}`);
}
