export default function DashboardLayoutLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton to match DashboardHeader */}
      <header className="border-b bg-background relative">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="skeleton-box h-6 w-20 rounded" />
            </div>
            <div className="flex items-center space-x-4">
              <div className="skeleton-box h-8 w-32 rounded" />
              <div className="skeleton-box h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-brand opacity-80" />
      </header>

      <main>
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="mb-8">
            <div className="skeleton-box h-8 w-32 rounded mb-2" />
            <div className="skeleton-box h-4 w-96 rounded" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 mb-8">
            {[1, 2].map((i) => (
              <div key={i} className="border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="skeleton-box h-5 w-5 rounded" />
                    <div className="skeleton-box h-6 w-32 rounded" />
                  </div>
                  <div className="skeleton-box h-6 w-24 rounded" />
                </div>
                <div className="space-y-3">
                  <div className="skeleton-box h-4 w-full rounded" />
                  <div className="skeleton-box h-4 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}