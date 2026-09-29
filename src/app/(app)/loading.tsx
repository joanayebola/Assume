import { PageBody } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <PageBody>
      <div role="status" aria-label="Loading">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-5 h-12 w-2/3 max-w-md" />
        <div className="mt-10 rounded-xl border-2 border-ink/15 p-6 sm:p-10">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-4 h-6 w-1/2" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-8 w-60 max-w-full" />
          </div>
          <Skeleton className="mt-9 h-14 w-56" />
        </div>
      </div>
    </PageBody>
  );
}
