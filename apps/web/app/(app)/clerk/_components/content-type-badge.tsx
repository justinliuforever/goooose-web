import { Badge } from "@/components/ui/badge";

export function ContentTypeBadge({ contentType }: { contentType: string }) {
  if (contentType.endsWith("_image")) {
    return <Badge variant="outline" className="text-[10px]">图文</Badge>;
  }
  if (contentType === "xhs_video") {
    return <Badge variant="outline" className="text-[10px]">短视频</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">视频</Badge>;
}
