import Navbar from '@/components/Navbar';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Default User</h3>
              <p className="text-sm text-muted">gradey</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Database</h3>
              <p className="text-sm text-muted">SQLite (dealuw.db)</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Version</h3>
              <p className="text-sm text-muted">0.1.0</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
