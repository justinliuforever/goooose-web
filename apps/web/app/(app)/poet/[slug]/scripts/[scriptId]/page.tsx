import { permanentRedirect } from "next/navigation";

export default async function PoetScriptRedirect({
  params,
}: {
  params: Promise<{ slug: string; scriptId: string }>;
}) {
  const { slug, scriptId } = await params;
  permanentRedirect(`/accounts/${encodeURIComponent(slug)}/projects/${encodeURIComponent(slug)}/poet/scripts/${encodeURIComponent(scriptId)}`);
}
