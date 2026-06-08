import { redirect } from "next/navigation";

// In the current 1:1 (account == project == channel), the channel/account detail page is
// the project hub, so bare /projects/[slug] redirects there. The explicit project namespace
// still owns the tool routes at /projects/[slug]/{clerk,muse,poet}. Temporary (307) — when a
// project can differ from its account (multiple projects per account), this becomes a real hub.
export default async function ProjectHubRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/channels/${encodeURIComponent(slug)}`);
}
