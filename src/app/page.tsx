import Navbar from '@/components/Navbar';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* Hero Section */}
        <div className="mb-10">
          <h1
            className="text-3xl font-bold text-accent mb-1"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            DealUW
          </h1>
          <p className="text-muted text-sm">Underwrite any deal in 60 seconds.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <StatCard label="Active Deals" value="--" />
          <StatCard label="Avg ARV" value="--" isMoney />
          <StatCard label="Pipeline Value" value="--" isMoney />
          <StatCard label="Closed This Month" value="--" />
        </div>

        {/* Recent Deals */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Recent Analyses</h2>
          </div>
          <div className="text-center py-16 text-muted">
            <p className="text-lg mb-2">No deals analyzed yet</p>
            <p className="text-sm">Click &quot;New Analysis&quot; to underwrite your first deal</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, isMoney }: { label: string; value: string; isMoney?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p
        className={`text-2xl font-bold ${isMoney ? 'text-gold' : 'text-foreground'}`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </p>
    </div>
  );
}
