import { Skeleton } from "@/components/ui/skeleton";

export default function PlanLoading() {
  return (
    <div role="status" aria-label="Loading your routine" className="mx-auto w-full max-w-5xl px-gutter py-8 sm:px-8 sm:py-12 lg:px-12">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-6 w-2/3 max-w-md" />
      <Skeleton className="mt-8 h-11 w-3/4 max-w-lg" />
      <Skeleton className="mt-4 h-6 w-40" />
      <Skeleton className="mt-6 h-5 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
      <Skeleton className="mt-12 h-11 w-52" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
