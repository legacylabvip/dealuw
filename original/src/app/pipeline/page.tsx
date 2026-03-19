import Navbar from '@/components/Navbar';

export default function PipelinePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-6">Pipeline</h1>
        <div className="grid grid-cols-3 gap-4">
          {['Analyzing', 'Offered', 'Under Contract', 'Dispo', 'Closed', 'Passed'].map((stage) => (
            <div key={stage} className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-muted mb-3">{stage}</h3>
              <div className="text-center py-8 text-muted text-xs">No deals</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
