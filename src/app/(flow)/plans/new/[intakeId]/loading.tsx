import { Skeleton } from "@/components/ui/skeleton";

export default function IntakeLoading() {
  return (
    <div role="status" aria-label="Loading your plan" className="flex min-h-dvh flex-1 flex-col">
      <div className="border-b-2 border-ink">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-gutter sm:px-6">
          <Skeleton className="size-7" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-gutter pb-3 sm:px-6">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-2 flex-1 rounded-[1px]" />
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-gutter pt-10 sm:px-6 sm:pt-14">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-8 h-9 w-3/4" />
        <Skeleton className="mt-5 h-28 w-full" />
        <Skeleton className="mt-14 h-9 w-2/3" />
        <Skeleton className="mt-5 h-24 w-full" />
      </div>
    </div>
  );
}
