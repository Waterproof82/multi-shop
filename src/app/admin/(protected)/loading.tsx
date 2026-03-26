'use client';

import { Loader2 } from 'lucide-react';

export default function AdminLoading() {
  return (
    <div className="pt-16 lg:pt-0 px-6 py-6 space-y-6">
      {/* Header skeleton */}
      <div className="bg-primary rounded-lg p-4 sm:p-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-primary-foreground/20 rounded" />
            <div className="h-4 w-24 bg-primary-foreground/10 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-primary-foreground/20 rounded-lg px-3 sm:px-4 py-2 sm:py-3">
                <div className="h-4 w-4 mx-auto mb-1 bg-primary-foreground/10 rounded" />
                <div className="h-6 w-8 mx-auto bg-primary-foreground/10 rounded" />
                <div className="h-3 w-12 mx-auto mt-0.5 bg-primary-foreground/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-10 w-32 bg-muted rounded-lg animate-pulse" />
      </div>

      {/* Recent orders skeleton */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-muted rounded animate-pulse" />
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
        <div className="divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-12 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              </div>
              <div className="text-right space-y-1">
                <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu preview skeleton */}
      <div className="bg-card rounded-lg border border-border p-4 lg:p-6">
        <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="space-y-1">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              </div>
              <div className="w-4 h-4 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
