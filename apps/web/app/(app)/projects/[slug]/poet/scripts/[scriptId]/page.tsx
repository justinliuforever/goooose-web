import { permanentRedirect } from "next/navigation";

export default async function ProjectScriptRedirect({
  params,
}: {
  params: Promise<{ slug: string; scriptId: string }>;
}) {
  const { slug, scriptId } = await params;
  const s = encodeURIComponent(slug);
  permanentRedirect(`/accounts/${s}/projects/${s}/poet/scripts/${encodeURIComponent(scriptId)}`);
}
