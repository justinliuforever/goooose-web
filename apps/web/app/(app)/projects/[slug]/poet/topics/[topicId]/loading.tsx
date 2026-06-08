import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Skeleton className="h-8 w-32" />

      <header className="flex flex-col gap-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-7 w-44" />
        </div>
      </section>

      {[0, 1, 2, 3, 4].map((i) => (
        <section key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </section>
      ))}
    </div>
  );
}
