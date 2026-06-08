import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Skeleton className="h-8 w-20" />

      <div className="flex items-center gap-3">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border bg-card p-5"
            >
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}
