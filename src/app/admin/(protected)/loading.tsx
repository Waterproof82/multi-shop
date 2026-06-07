'use client';

export default function AdminLoading() {
  return (
    <div className="pt-16 lg:pt-0 px-6 py-8 space-y-8 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header skeleton */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-white/20 rounded-lg" />
            <div className="h-4 w-32 bg-white/10 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['stat-metric-revenue', 'stat-metric-today', 'stat-metric-pending', 'stat-metric-total'].map((key) => (
              <div key={key} className="backdrop-blur-xl bg-white/10 border border-white/10 rounded-xl px-3 sm:px-4 py-3">
                <div className="h-6 w-6 mx-auto mb-2 bg-white/20 rounded" />
                <div className="h-7 w-10 mx-auto bg-white/20 rounded" />
                <div className="h-3 w-14 mx-auto mt-1 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-32 bg-white/10 border border-white/20 rounded-lg animate-pulse" />
        <div className="h-10 w-32 bg-white/10 border border-white/20 rounded-lg animate-pulse" />
      </div>

      {/* Recent orders skeleton */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-white/20 rounded-lg animate-pulse" />
            <div className="h-6 w-40 bg-white/20 rounded animate-pulse" />
          </div>
        </div>
        <div className="divide-y divide-white/10">
          {['order-recent-one', 'order-recent-two', 'order-recent-three'].map((key) => (
            <div key={key} className="p-6 flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-16 bg-white/20 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-white/20 rounded animate-pulse" />
                </div>
                <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
              </div>
              <div className="text-right space-y-2">
                <div className="h-6 w-20 bg-white/20 rounded animate-pulse" />
                <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu preview skeleton */}
      <div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="h-7 w-40 bg-white/20 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {['menu-item-one', 'menu-item-two', 'menu-item-three', 'menu-item-four', 'menu-item-five'].map((key) => (
            <div key={key} className="flex items-center justify-between py-4 px-4 rounded-lg bg-white/5 border border-white/10">
              <div className="space-y-1 flex-1">
                <div className="h-5 w-40 bg-white/20 rounded animate-pulse" />
                <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
              </div>
              <div className="w-5 h-5 bg-white/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
