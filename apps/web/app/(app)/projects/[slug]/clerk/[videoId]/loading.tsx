import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <Skeleton className="h-8 w-32" />

      <header className="flex flex-col gap-3">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
