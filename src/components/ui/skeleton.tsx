import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: Readonly<SkeletonProps>) {
  return (
    <div
      className={cn(
        'animate-pulse motion-reduce:animate-none rounded-md bg-muted',
        className
      )}      style={{
        animationDuration: '1.5s',
        animationTimingFunction: 'ease-in-out',
      }}    />
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

function SkeletonTable({ rows = 5, columns = 4, className }: Readonly<SkeletonTableProps>) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header skeleton */}
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`skeleton-header-${columns}-${i}`} className="h-6 flex-1" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`skeleton-row-${rows}-${rowIndex}`} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              className={cn(
                'h-4 flex-1',
                colIndex === 0 && 'w-16', // First column narrower
                colIndex === columns - 1 && 'w-20' // Last column for actions
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

function SkeletonCard({ className }: Readonly<SkeletonCardProps>) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

interface SkeletonStatsProps {
  count?: number;
  className?: string;
  itemClassName?: string;
}

function SkeletonStats({ count = 4, className, itemClassName }: Readonly<SkeletonStatsProps>) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={`skeleton-stats-item-${count}-${i}`} className={cn('bg-muted rounded-lg p-3 space-y-2', itemClassName)}>
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonTable, SkeletonCard, SkeletonStats };