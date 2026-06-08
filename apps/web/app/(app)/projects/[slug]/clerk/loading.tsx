import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Skeleton className="h-8 w-24" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
